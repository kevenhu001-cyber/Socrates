/**
 * codeInterpreter.js — public API for the sandboxed Python executor.
 *
 * Spawns a small pool of Pyodide WASM workers (Node `worker_threads`)
 * and brokers `execute({userId, sessionId, language, code, timeoutMs, signal})`
 * requests through them. Each call:
 *   1. Inserts a row into `executions` with status='running'.
 *   2. Borrows an idle worker, hands it the code + a SharedArrayBuffer
 *      so the parent can SIGINT it on timeout.
 *   3. Awaits the structured result (status, stdout, stderr, artifacts).
 *   4. Copies each artifact file into the shared uploads dir and
 *      inserts a matching row in the `files` table with executionId set.
 *   5. Updates the executions row to its final status and returns.
 *
 * Frontend-visible tool definition is also exported here (CODE_INTERPRETER_TOOL)
 * so the chat route can attach it to upstream requests.
 *
 * Feature flag: set EXEC_RUNNER=disabled to turn the tool off entirely.
 * The chat route omits CODE_INTERPRETER_TOOL from the upstream request
 * in that case and `execute()` returns status='skipped' if called directly.
 */
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import os from 'node:os';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { executions, files } from '../db/schema.js';
import { recordAudit } from '../middleware/audit.js';
import { persistArtifact } from './fileArtifacts.js';
import { TooManyRequests } from '../lib/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ─── Configuration (env-driven, defaults match .env.example) ─── */
const EXEC_RUNNER = process.env.EXEC_RUNNER || 'pyodide';
const POOL_SIZE = parseInt(process.env.EXEC_WORKER_POOL_SIZE || '2', 10);
const PYODIDE_VERSION = process.env.EXEC_PYODIDE_VERSION || '0.26.4';
const DEFAULT_TIMEOUT_MS = parseInt(process.env.EXEC_TIMEOUT_MS_DEFAULT || '30000', 10);
const MAX_OUTPUT_BYTES = parseInt(process.env.EXEC_MAX_OUTPUT_BYTES || '65536', 10);
const MAX_ARTIFACT_BYTES = parseInt(process.env.EXEC_MAX_ARTIFACT_BYTES || '10485760', 10);
const SCRATCH_DIR = process.env.EXEC_SCRATCH_DIR
  || (process.env.NODE_ENV === 'production' ? '/var/lib/socrates/exec' : path.join(os.tmpdir(), 'socrates-exec'));

/* Make sure the scratch root exists before any worker is spawned. */
await fs.mkdir(SCRATCH_DIR, { recursive: true }).catch(() => {});

/* ─── Tool definition (sent to upstream on every chat turn) ─── */
export const CODE_INTERPRETER_TOOL = {
  type: 'function',
  function: {
    name: 'code_interpreter',
    description:
      'Execute Python code in a sandboxed Pyodide WASM runtime. Use for arithmetic, data manipulation, plotting, quick verification of numeric claims. ' +
      'Each call is a fresh interpreter — no persistent state across calls. ' +
      'Available libraries: Python 3.12 standard library (subset), NumPy, pandas, matplotlib. ' +
      `Stdout/stderr are capped at ${MAX_OUTPUT_BYTES} bytes; runs that exceed it fail with output_limit_exceeded. ` +
      'Files the code writes to the current directory are returned as artifacts (PNG charts, CSV exports, etc.) and surfaced as inline links. ' +
      'No network access, no filesystem access outside the artifact directory, no subprocess.',
    parameters: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['python'],
          default: 'python',
          description: 'Always "python" in v1.',
        },
        code: {
          type: 'string',
          description: 'Python source code to execute. State does not persist across calls.',
        },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
};

/* ─── Worker pool ───
 * Each Worker wraps a pyodideWorker.js that holds one warm Pyodide
 * instance. We round-robin between idle workers and queue excess
 * callers on a FIFO. Timeouts terminate the worker and respawn — the
 * Pyodide interrupt buffer can't interrupt a CPU-bound pure-Python
 * loop (while True: pass) because there's no Python tick boundary.
 */
class WorkerSlot {
  constructor({ index, pool }) {
    this.index = index;
    this.pool = pool;
    this.busy = false;
    this.queue = [];
    this.worker = null;
    this.ready = null;
    this.failedBoots = 0;
    this.terminated = false;
  }
  spawn() {
    const workerFile = path.join(__dirname, 'pyodideWorker.js');
    const w = new Worker(workerFile, {
      resourceLimits: {
        maxOldGenerationSizeMb: 256,
        maxYoungGenerationSizeMb: 32,
      },
    });
    this.worker = w;
    this.ready = new Promise((resolve, reject) => {
      const onMessage = (msg) => {
        if (msg && msg.id === 'boot') {
          w.off('message', onMessage);
          if (msg.type === 'ready') resolve();
          else reject(new Error(msg.error || 'pyodide boot failed'));
        }
      };
      w.on('message', onMessage);
      w.on('error', reject);
    });
    w.on('exit', (code) => {
      const wasBusy = this.busy;
      this.worker = null;
      this.ready = null;
      this.busy = false;
      // Drain queued waiters with a structured failure.
      while (this.queue.length) {
        const waiter = this.queue.shift();
        if (typeof waiter === 'function') waiter();
      }
      // Reject any in-flight promise if we were killed mid-run.
      if (wasBusy && this.pool) this.pool._onSlotDied(this, code);
      if (code !== 0) this.failedBoots++;
    });
  }
  async acquire() {
    if (this.failedBoots > 3) {
      throw new Error('pyodide_worker_disabled: too many boot failures');
    }
    if (!this.worker || this.terminated) {
      this.terminated = false;
      this.spawn();
    }
    await this.ready;
    if (this.busy) {
      await new Promise((resolve) => this.queue.push(resolve));
    }
    this.busy = true;
    return this.worker;
  }
  release() {
    this.busy = false;
    const next = this.queue.shift();
    if (next) next();
  }
  terminate() {
    this.terminated = true;
    if (this.worker) {
      try { this.worker.terminate(); } catch (_) {}
    }
  }
}

class PyodidePool {
  constructor({ size }) {
    this.slots = Array.from({ length: size }, (_, i) => new WorkerSlot({ index: i, pool: this }));
    this._inflightReject = null;
  }
  /**
   * Round-robin across idle slots. If all slots are busy, queue on slot 0
   * (simplest possible scheduler — adequate for the 2-worker default).
   */
  async acquireSlot() {
    for (const slot of this.slots) {
      if (!slot.busy && slot.worker && !slot.terminated) return slot;
    }
    // All busy → wait on slot 0.
    const slot = this.slots[0];
    await slot.acquire();
    slot.release();
    return this.slots.find((s) => !s.busy) || slot;
  }
  _onSlotDied(slot, code) {
    if (this._inflightReject) {
      const reject = this._inflightReject;
      this._inflightReject = null;
      reject(new Error(`pyodide_worker_exited: code=${code}`));
    }
  }
}

let pool = null;
function getPool() {
  if (!pool) {
    if (EXEC_RUNNER === 'disabled') return null;
    pool = new PyodidePool({ size: POOL_SIZE });
    console.log(`[code-interpreter] pool ready (${POOL_SIZE} workers, pyodide ${PYODIDE_VERSION})`);
  }
  return pool;
}

/* ─── Single execution through one worker ─── */
async function runOnWorker({ executionId, code, timeoutMs, signal, scratchDir, maxOutputBytes }) {
  const pool = getPool();
  const slot = await pool.acquireSlot();
  const worker = await slot.acquire();
  const id = crypto.randomUUID();
  const interruptBuffer = new SharedArrayBuffer(8);

  const timeout = Math.max(100, timeoutMs || DEFAULT_TIMEOUT_MS);

  // SIGINT path: works for I/O-bound code (time.sleep, file reads, etc).
  // Doesn't work for CPU-bound pure-Python loops — those need termination.
  const sigintTimer = setTimeout(() => {
    try { new Uint8Array(interruptBuffer)[0] = 0x02; } catch (_) {}
  }, timeout);

  // Hard termination fallback: if SIGINT hasn't returned within timeout + 1s,
  // terminate the worker. The slot's exit handler rejects the in-flight
  // promise and respawns on next acquire.
  const terminateTimer = setTimeout(() => {
    slot.terminate();
  }, timeout + 1000);

  try {
    const result = await new Promise((resolve, reject) => {
      pool._inflightReject = reject;
      const onAbort = () => {
        try { new Uint8Array(interruptBuffer)[0] = 0x02; } catch (_) {}
      };
      if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
      const onMessage = (msg) => {
        if (msg && msg.id === id) {
          worker.off('message', onMessage);
          if (signal) signal.removeEventListener('abort', onAbort);
          pool._inflightReject = null;
          resolve(msg);
        }
      };
      worker.on('message', onMessage);
      try {
        worker.postMessage({
          id,
          type: 'run',
          executionId,
          code,
          scratchDir,
          maxOutputBytes: maxOutputBytes || MAX_OUTPUT_BYTES,
          interruptBuffer,
        });
      } catch (err) {
        if (signal) signal.removeEventListener('abort', onAbort);
        pool._inflightReject = null;
        reject(err);
      }
    });
    return result;
  } finally {
    clearTimeout(sigintTimer);
    clearTimeout(terminateTimer);
    slot.release();
  }
}

/* ─── Public execute() — the surface the chat route calls ─── */
export const codeInterpreter = {
  /**
   * Run code through the pool. Persists a row in `executions`, runs
   * the code, persists artifacts into `files`, updates the execution
   * row, and records an audit_event.
   *
   * opts: { userId, sessionId, language, code, timeoutMs, signal }
   * Returns: { executionId, status, stdout, stderr, exitCode, durationMs,
   *            errorMessage, artifactFileIds, artifactCount }
   */
  async execute(opts) {
    if (EXEC_RUNNER === 'disabled') {
      return { status: 'skipped', errorMessage: 'code_interpreter_disabled', artifactFileIds: [], artifactCount: 0 };
    }
    const userId = opts.userId || null;
    const sessionId = opts.sessionId || null;
    const code = String(opts.code || '');
    const language = opts.language || 'python';
    const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    const signal = opts.signal || null;

    const pool = getPool();
    if (!pool) {
      return { status: 'skipped', errorMessage: 'code_interpreter_disabled', artifactFileIds: [], artifactCount: 0 };
    }

    const db = getDb();

    // Insert the running row up front so we have an ID for foreign keys
    // and so the row exists even if the worker crashes mid-run.
    const [inserted] = await db.insert(executions).values({
      userId,
      sessionId,
      language,
      code,
      status: 'running',
      startedAt: new Date(),
    }).returning();
    const executionId = inserted.id;

    const executionScratchDir = path.join(SCRATCH_DIR, executionId);

    let result;
    try {
      await fs.mkdir(executionScratchDir, { recursive: true });
      result = await runOnWorker({
        executionId,
        code,
        timeoutMs,
        signal,
        scratchDir: executionScratchDir,
        maxOutputBytes: MAX_OUTPUT_BYTES,
      });
    } catch (err) {
      // Two paths bubble out of runOnWorker:
      //   1. SIGINT path: worker returned status='timeout' normally — handled above.
      //   2. Hard termination path: worker process exited (code != 0) without
      //      delivering a result, typically because the run was CPU-bound and
      //      the SIGINT couldn't break the loop. Map this to 'timeout' so
      //      callers see the same status as the cooperative case.
      const msg = String(err && err.message || err);
      const isWorkerCrash = /pyodide_worker_exited/.test(msg);
      result = {
        status: isWorkerCrash ? 'timeout' : 'failed',
        errorMessage: isWorkerCrash ? 'timeout' : `pool_error: ${msg}`,
        stdout: '',
        stderr: '',
        exitCode: isWorkerCrash ? 124 : 1,
        durationMs: 0,
        artifacts: [],
      };
    }

    // Persist artifacts. Each file in result.artifacts is something the
    // user's Python wrote into the artifacts/ subdir.
    const artifactFileIds = [];
    const persistedArtifacts = [];
    for (const art of (result.artifacts || [])) {
      if (art.size > MAX_ARTIFACT_BYTES) {
        // Too big — drop it (still count as a failed artifact so the
        // user can see why their PNG didn't show).
        persistedArtifacts.push({ ...art, dropped: true, reason: 'too_large' });
        continue;
      }
      try {
        const { id: fileId, sha256, mimeType } = await persistArtifact({
          userId,
          sessionId,
          executionId,
          sourcePath: art.absPath,
          originalName: art.name,
          size: art.size,
        });
        artifactFileIds.push({ id: fileId, name: art.name, mimeType });
        persistedArtifacts.push({ ...art, fileId, mimeType });
      } catch (err) {
        persistedArtifacts.push({ ...art, error: String(err && err.message || err) });
      }
    }

    const finalStatus = result.status || 'failed';
    const finalArtifactCount = artifactFileIds.length;

    // Update the execution row.
    await db.update(executions).set({
      status: finalStatus,
      exitCode: result.exitCode ?? null,
      durationMs: result.durationMs ?? null,
      stdout: (result.stdout || '').slice(0, MAX_OUTPUT_BYTES),
      stderr: (result.stderr || '').slice(0, MAX_OUTPUT_BYTES),
      artifactCount: finalArtifactCount,
      completedAt: new Date(),
    }).where(eq(executions.id, executionId));

    // Audit. Best-effort — never throw out of execute() on audit failure.
    if (userId) {
      recordAudit(userId, 'code_execution', {
        executionId,
        language,
        status: finalStatus,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        artifactCount: finalArtifactCount,
        errorMessage: result.errorMessage || null,
      }).catch(() => {});
    }

    // Reap the scratch dir now that we've persisted everything we want.
    fs.rm(executionScratchDir, { recursive: true, force: true }).catch(() => {});

    return {
      executionId,
      status: finalStatus,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      errorMessage: result.errorMessage || null,
      artifactFileIds,                 // [{id, name, mimeType}]
      artifactCount: finalArtifactCount,
    };
  },

  /**
   * Returns the OpenAI-style tool definition for the chat route to attach
   * to upstream requests. If the runner is disabled, returns null.
   */
  getToolDefinition() {
    if (EXEC_RUNNER === 'disabled') return null;
    return CODE_INTERPRETER_TOOL;
  },

  /**
   * Test helper: force-init the pool so the first user request doesn't
   * pay the 3-5s warm-up cost. Optional; called automatically on first
   * execute().
   */
  async warm() {
    return getPool();
  },

  /* ─── Internal hooks for tests / dev ─── */
  _config: {
    poolSize: POOL_SIZE,
    pyodideVersion: PYODIDE_VERSION,
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputBytes: MAX_OUTPUT_BYTES,
    maxArtifactBytes: MAX_ARTIFACT_BYTES,
    scratchDir: SCRATCH_DIR,
    runner: EXEC_RUNNER,
  },
};