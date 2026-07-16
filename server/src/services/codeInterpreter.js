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
import { EventEmitter } from 'node:events';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { executions, files } from '../db/schema.js';
import { recordAudit } from '../middleware/audit.js';
import { persistArtifact } from './fileArtifacts.js';
import { TooManyRequests } from '../lib/errors.js';
import { publish, subscribe as pubsubSubscribe, getStatus as pubsubStatus } from '../lib/pubsub.js';

/* ─── Execution progress pub/sub ───
 * P_pubsub — replaces the in-process EventEmitter so SSE clients on
 * process B receive progress / result events emitted by process A.
 * Routes/chats.js subscribes to `exec_progress:{id}` and
 * `exec_result:{id}` via subscribeExecution*; the call chain
 * publishes via publish() through Postgres LISTEN/NOTIFY (or the
 * local fallback if PG is down).
 *
 * Public API is unchanged — subscribeExecution(unsubscribe) and
 * subscribeExecutionResult(unsubscribe) — so callers don't need to
 * know about the underlying transport.
 *
 * Events emitted (payload shape):
 *   exec_progress:{executionId}  — { phase, stream, chunk, elapsedMs, executionId }
 *   exec_result:{executionId}    — final { status, executionId, stdout, stderr, ... }
 */
export async function subscribeExecution(executionId, listener) {
  return pubsubSubscribe(`exec_progress:${executionId}`, listener);
}

export function unsubscribeExecution(executionId, listener) {
  /* No-op: pubsub's subscribe() returns its own unsubscribe handle
     that the caller should use. We keep the legacy sync API as a
     wrapper that returns undefined so the few places that ignore the
     return value (chat.js #1) still work. The full cleanup happens
     when the chat route closes the SSE connection and invokes the
     handle returned from subscribeExecution(). */
  void listener;
}

export async function subscribeExecutionResult(executionId, listener) {
  return pubsubSubscribe(`exec_result:${executionId}`, listener);
}

export async function unsubscribeExecutionResult(executionId, listener) {
  void listener;
}

/* Internal helper: emit a progress event to all subscribers (now
   potentially on other processes) AND forward to the call-site
   onProgress callback so the chat SSE stream can also stream progress
   inline. */
function emitProgress(executionId, event, onProgress) {
  publish(`exec_progress:${executionId}`, event).catch(() => { /* logged in pubsub */ });
  if (typeof onProgress === 'function') {
    try { onProgress(event); } catch (_) {}
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ─── Configuration (env-driven, defaults match .env.example) ─── */
const EXEC_RUNNER = process.env.EXEC_RUNNER || 'pyodide';
const POOL_SIZE = parseInt(process.env.EXEC_WORKER_POOL_SIZE || '1', 10);
const PYODIDE_VERSION = process.env.EXEC_PYODIDE_VERSION || '0.26.4';
const DEFAULT_TIMEOUT_MS = parseInt(process.env.EXEC_TIMEOUT_MS_DEFAULT || '30000', 10);
const MAX_OUTPUT_BYTES = parseInt(process.env.EXEC_MAX_OUTPUT_BYTES || '65536', 10);
const MAX_ARTIFACT_BYTES = parseInt(process.env.EXEC_MAX_ARTIFACT_BYTES || '10485760', 10);
/* P_code-size-cap — cap the source a single execution can carry so
   neither the `executions.code` row nor the in-memory worker buffer
   can be weaponised into a deniability-of-storage surface. The chat
   schema already caps message content at 200 KB; we mirror that for
   the tool's own code argument. */
const MAX_CODE_CHARS = parseInt(process.env.EXEC_MAX_CODE_CHARS || '200000', 10);
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
      'Execute Python code in a sandboxed Pyodide WASM runtime. ' +
      /* P_tool-scope — be explicit at the tool-definition layer (which
         the model sees when choosing tools) about what this tool is
         NOT for. Without this, "draw a squirrel" gets routed here
         because matplotlib can technically plot things. */
      'Use ONLY for arithmetic, data manipulation, and DATA-VISUALIZATION PLOTS (line/scatter/bar/heatmap of numbers from numpy or pandas). ' +
      'ABSOLUTELY DO NOT use for illustrations, drawings, pictures, or sketches of concrete subjects (animals, people, scenes, logos, icons) — those MUST go in a ```viz block as inline SVG, not Python. ' +
      'When the user says "用 SVG 画" or "draw with SVG" or "draw a <concrete subject>" — that is an SVG illustration request, NOT a code_interpreter task. Output a ```viz block with hand-written SVG instead. ' +
      'Each call is a fresh interpreter — no persistent state across calls. ' +
      'Available libraries: Python 3.12 standard library (subset), NumPy, pandas, matplotlib. ' +
      `Stdout/stderr are capped at ${MAX_OUTPUT_BYTES} bytes; runs that exceed it fail with output_limit_exceeded. ` +
      'Files the code writes to the current directory are returned as artifacts (PNG charts, CSV exports, etc.) and surfaced as inline links. ' +
      /* P_sandbox-filesystem — describe the file system constraints
         directly in the tool description so the model never asks
         the user to "load the data" from a path that isn't
         available, and so any FileNotFoundError at runtime is
         already pre-empted by the prompt the model sees. */
      'Sandbox: only files the run itself writes are present in the working directory. There is no access to the user\'s local filesystem, no upload path, and no network fetch — so open() / read_csv() / Image.open() will FAIL with FileNotFoundError unless the file was just produced by an earlier statement in the SAME run. ' +
      'To work with user-supplied data, the previous statement must have written the file first (e.g. by reading a base64 payload and decoding it), or you must generate the data inline (e.g. via numpy / random). ' +
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
          maxLength: 200000,
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
    this.worker = null;
    this.ready = null;
    this.failedBoots = 0;
    this.terminated = false;
    this._readyResolved = false;
    this._inflightReject = null; // per-slot reject handler (avoids pool-level race)
    // Promise chain that serializes all async claims on this slot. Each
    // claim atomically replaces _claimChain with a fresh pending link;
    // the next claim awaits the previous one. The chain advances when
    // the in-flight claim's release trap resolves its link. This avoids
    // the race in the original queue+busy-flag design where two callers
    // could both observe busy=false after a release and both return the
    // same slot to their callers.
    this._claimChain = Promise.resolve();
    // Resolver for the in-flight claim's release promise. release()
    // calls this to clear busy and unblock the next queued claim.
    this._releaseCurrent = null;
  }
  spawn() {
    const workerFile = path.join(__dirname, 'pyodideWorker.js');
    const w = new Worker(workerFile, {
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 32,
      },
    });
    this.worker = w;
    this._readyResolved = false;
    this.ready = new Promise((resolve, reject) => {
      const onMessage = (msg) => {
        if (msg && msg.id === 'boot') {
          w.off('message', onMessage);
          if (msg.type === 'ready') {
            this._readyResolved = true;
            resolve();
          } else reject(new Error(msg.error || 'pyodide boot failed'));
        }
      };
      w.on('message', onMessage);
      w.on('error', reject);
    });
    w.on('exit', (code) => {
      const wasBusy = this.busy;
      this.worker = null;
      this.ready = null;
      this._readyResolved = false;
      this.busy = false;
      // Reject any in-flight promise if we were killed mid-run.
      // Use per-slot _inflightReject (not pool-level) to avoid
      // race conditions with concurrent executions on other slots.
      if (this._inflightReject) {
        const r = this._inflightReject;
        this._inflightReject = null;
        r(new Error(`pyodide_worker_exited: code=${code}`));
      }
      // Unblock any in-flight claim so the chain advances.  If
      // terminated, the chain was already resolved; null check
      // prevents double-resolve.
      if (this._releaseCurrent) {
        const r = this._releaseCurrent;
        this._releaseCurrent = null;
        r();
      }
      if (code !== 0) this.failedBoots++;
    });
  }
  /**
   * Synchronous fast-path claim. Atomic in the Node.js event loop:
   * between the busy check and the set, no other JS runs. Returns true
   * iff we successfully claimed the slot. Returns false if the slot is
   * busy, terminated, the worker hasn't booted, or the boot-failure
   * threshold was hit. Callers should fall back to claim() on false.
   */
  tryClaim() {
    if (this.failedBoots > 3) return false;
    if (this.busy) return false;
    // Auto-respawn terminated workers so the pool is self-healing.
    // Without this, after POOL_SIZE consecutive timeouts all slots
    // become dead and the pool hangs forever.
    if (this.terminated) {
      this.terminated = false;
      this.failedBoots = 0;
      this.spawn();
      return false; // caller will queue via claim() and wait for boot
    }
    if (!this.worker || !this._readyResolved) return false;
    this.busy = true;
    // Update the chain link so any concurrent claim() (which captured
    // the old resolved _claimChain) now queues behind us instead of
    // racing past busy=true.
    let resolveNextRelease;
    this._claimChain = new Promise((resolve) => { resolveNextRelease = resolve; });
    this._installReleaseTrap(resolveNextRelease);
    return true;
  }
  /**
   * Async claim. Tries tryClaim() first; if the slot is busy or unbooted,
   * awaits _claimChain and retries. Concurrent claim()s serialize via
   * _claimChain so there's no race on the busy flag (only one claim
   * resolves at a time per slot). The returned promise resolves with
   * this slot's worker once claimed; the caller MUST call release()
   * when done.
   *
   * Rejects if boot has failed too many times on this slot.
   */
  async claim() {
    while (true) {
      if (this.failedBoots > 3) {
        throw new Error('pyodide_worker_disabled: too many boot failures');
      }
      if (this.tryClaim()) return this.worker;
      // If the worker hasn't booted yet, await the ready promise
      // instead of spinning on _claimChain (which is initialized to
      // Promise.resolve() and would resolve immediately in a tight
      // loop, burning CPU until the worker boots).
      if (!this._readyResolved && this.ready) {
        await this.ready;
        continue;
      }
      // Worker is ready but busy (or respawning) — wait for the
      // in-flight claim to release, then re-check.
      await this._claimChain;
    }
  }
  /**
   * Internal: install the release trap. When release() is called, this
   * clears busy and resolves the chain link (if provided) so the next
   * queued claim can proceed.
   */
  _installReleaseTrap(resolveNextRelease) {
    let resolveRelease;
    const myRelease = new Promise((resolve) => { resolveRelease = resolve; });
    this._releaseCurrent = resolveRelease;
    myRelease.then(() => {
      this.busy = false;
      this._releaseCurrent = null;
      if (resolveNextRelease) resolveNextRelease();
    }).catch(() => {});
  }
  /**
   * Release the slot. Resolves the in-flight claim's release promise so
   * its hold completes and the next queued claim can proceed.
   */
  release() {
    if (this._releaseCurrent) {
      const r = this._releaseCurrent;
      this._releaseCurrent = null;
      r();
    }
  }
  /**
   * Terminate the worker. Used on timeout to break CPU-bound pure-Python
   * loops that the SIGINT interrupt buffer can't break. The exit handler
   * clears worker/busy; we also release any in-flight claim here in case
   * the exit is delayed, so the chain advances promptly.
   */
  terminate() {
    this.terminated = true;
    if (this.worker) {
      try { this.worker.terminate(); } catch (_) {}
    }
    if (this._releaseCurrent) {
      const r = this._releaseCurrent;
      this._releaseCurrent = null;
      r();
    }
  }
}

class PyodidePool {
  constructor({ size }) {
    this.slots = Array.from({ length: size }, (_, i) => {
      const s = new WorkerSlot({ index: i, pool: this });
      s.spawn();
      return s;
    });
    this._nextStart = 0;
  }
  /**
   * Acquire a slot for a new run. Round-robin start for fairness and
   * load balance under contention.
   *
   * Phase 1 — synchronous fast path: try tryClaim() on each slot in
   * round-robin order. tryClaim() is atomic in the event loop, so
   * concurrent acquireSlot() calls can't both grab the same slot.
   * Returns immediately on the first idle slot.
   *
   * Phase 2 — async queue: if all slots are busy or unbooted, queue
   * on the round-robin slot (not always slot 0) via claim().
   * claim() serializes waiters via _claimChain (FIFO, no race on
   * busy). Picking the round-robin slot distributes queued callers
   * across both slots — otherwise a single hot slot ends up doing
   * all the work while the other sits idle.
   */
  async acquireSlot() {
    const startIdx = this._nextStart;
    for (let i = 0; i < this.slots.length; i++) {
      const idx = (startIdx + i) % this.slots.length;
      const slot = this.slots[idx];
      if (slot.tryClaim()) {
        this._nextStart = (idx + 1) % this.slots.length;
        return slot;
      }
    }
    // All busy (or unbooted). Queue on the round-robin slot (not
    // always slot 0) so queued callers distribute across both slots
    // — otherwise a single hot slot ends up doing all the work while
    // the other sits idle. claim() serializes waiters FIFO via
    // _claimChain so concurrent async claimers don't race on busy.
    const slot = this.slots[startIdx];
    this._nextStart = (startIdx + 1) % this.slots.length;
    await slot.claim();
    return slot;
  }
  _onSlotDied(slot, code) {
    // Rejection is now handled per-slot in the WorkerSlot exit handler.
    // The pool-level _inflightReject was removed because concurrent
    // executions on different slots could overwrite each other's
    // reject handler. Each WorkerSlot tracks its own _inflightReject.
  }
}

let pool = null;
let _poolInitLock = null;
/* P_pool-retry — `_poolInitLock` was previously a Promise that, on
   failure, was never cleared. Every subsequent getPool() call would
   await the same rejected promise and re-throw, permanently disabling
   the executor. We now wrap the IIFE in try/finally so a transient
   boot failure (e.g. the worker file was briefly unreadable) lets the
   next caller retry. Concurrent first-callers still share a single
   in-flight init via the captured promise. */
async function getPool() {
  if (pool) return pool;
  if (EXEC_RUNNER === 'disabled') return null;
  if (!_poolInitLock) {
    _poolInitLock = (async () => {
      try {
        pool = new PyodidePool({ size: POOL_SIZE });
        console.log(`[code-interpreter] pool ready (${POOL_SIZE} workers, pyodide ${PYODIDE_VERSION})`);
      } finally {
        /* Clear the lock so a later call can retry on failure. The
           next caller sees `pool === null` (init never produced one)
           and starts a fresh init. On success the lock is cleared
           and subsequent callers short-circuit on `pool`. */
        _poolInitLock = null;
      }
    })();
  }
  await _poolInitLock;
  return pool;
}

/* ─── Single execution through one worker ─── */
async function runOnWorker({ executionId, code, timeoutMs, signal, scratchDir, maxOutputBytes, onProgress }) {
  /* P_progress — safe noop default so existing callers (tests, direct
     execute()) work without changes. */
  const emit = (typeof onProgress === 'function')
    ? (p) => { try { onProgress(p); } catch (_) {} }
    : () => {};
    const pool = await getPool();
    /* P_progress — surface the wait while a worker is busy/booting. */
    emitProgress(executionId, { phase: 'queued', executionId }, onProgress);
    const slot = await pool.acquireSlot();
    emitProgress(executionId, { phase: 'ready', executionId }, onProgress);
  // slot.tryClaim()/claim() already returned a fully-claimed slot with
  // a booted worker, so slot.worker is ready — no second await needed.
  const worker = slot.worker;
  const id = crypto.randomUUID();
  const interruptBuffer = new SharedArrayBuffer(8);

  const timeout = Math.max(100, timeoutMs || DEFAULT_TIMEOUT_MS);

  // SIGINT path: works for I/O-bound code (time.sleep, file reads, etc).
  // Doesn't work for CPU-bound pure-Python loops — those need termination.
  // Progressive timeout warnings — notify listeners at 50%, 80%, and 95%
  // of the budget so the UI can show "still running…" instead of silence.
  const timeoutCheckpoints = [
    { at: 0.50, label: '50%' },
    { at: 0.80, label: '80%' },
    { at: 0.95, label: '95%' },
  ];
  const timeoutWarnings = [];
  for (const cp of timeoutCheckpoints) {
    const t = setTimeout(() => {
      emitProgress(executionId, {
        phase: 'timeout_warning',
        stream: null,
        chunk: `Execution at ${cp.label} of timeout (${(timeout / 1000).toFixed(0)}s)`,
        executionId,
        elapsedMs: Math.round(timeout * cp.at),
      }, onProgress);
    }, Math.round(timeout * cp.at));
    timeoutWarnings.push(t);
  }

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
      slot._inflightReject = reject; // per-slot, not pool._inflightReject
      const onAbort = () => {
        try { new Uint8Array(interruptBuffer)[0] = 0x02; } catch (_) {}
      };
      if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
      const onMessage = (msg) => {
        if (!msg || msg.id !== id) return;
        /* P_progress — forward incremental stdout/stderr from the
           worker so the chat route can stream them as
           `tool_progress` SSE events. The terminal `result` message
           has type='result'; everything else is incremental output. */
        if (msg.type === 'stdout' || msg.type === 'stderr' || msg.type === 'phase') {
          emitProgress(executionId, {
            phase: msg.type,
            stream: msg.type,
            chunk: msg.chunk || '',
            executionId,
            elapsedMs: msg.elapsedMs,
          }, onProgress);
          return;
        }
        if (msg.type === 'result' || msg.status) {
          worker.off('message', onMessage);
          if (signal) signal.removeEventListener('abort', onAbort);
          slot._inflightReject = null;
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
        worker.off('message', onMessage);
        if (signal) signal.removeEventListener('abort', onAbort);
        slot._inflightReject = null;
        reject(err);
      }
    });
    return result;
  } finally {
    clearTimeout(sigintTimer);
    clearTimeout(terminateTimer);
    for (const t of timeoutWarnings) clearTimeout(t);
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
      /* P_progress — still emit a terminal so the chat route can
         clear its "queued" spinner even on the disabled path. */
      if (typeof opts.onProgress === 'function') {
        try { opts.onProgress({ phase: 'skipped', reason: 'runner_disabled' }); } catch (_) {}
      }
      return { status: 'skipped', errorMessage: 'code_interpreter_disabled', artifactFileIds: [], artifactCount: 0 };
    }
    const userId = opts.userId || null;
    const sessionId = opts.sessionId || null;
    const code = String(opts.code || '');
    const language = opts.language || 'python';
    const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    const signal = opts.signal || null;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    /* P_code-size-cap — reject oversized sources BEFORE we touch
       the database, the scratch dir, or the worker pool. The user
       sees a stable 'failed/code_too_large' status and we never
       persist a 10 MB `executions.code` row. */
    if (code.length > MAX_CODE_CHARS) {
      const maxKb = Math.round(MAX_CODE_CHARS / 1024);
      return {
        status: 'failed',
        errorMessage: `code_too_large: source exceeds ${maxKb} KB limit`,
        stdout: '',
        stderr: '',
        exitCode: 1,
        durationMs: 0,
        artifacts: [],
        artifactFileIds: [],
        artifactCount: 0,
      };
    }

    const pool = await getPool();
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
        onProgress,
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
    // Emit failure result to pubsub subscribers (SSE clients).
    publish(`exec_result:${executionId}`, {
      phase: 'failed',
      executionId,
      status: result.status,
      errorMessage: result.errorMessage,
      stdout: '',
      stderr: '',
      durationMs: 0,
    }).catch(() => { /* logged in pubsub */ });
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

    // Emit final result to pubsub subscribers (SSE clients, possibly
    // on another process). Fire-and-forget — pubsub logs internally
    // on failure; we never let the emit block the resolve.
    publish(`exec_result:${executionId}`, {
      phase: 'completed',
      executionId,
      status: finalStatus,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      durationMs: result.durationMs || 0,
      exitCode: result.exitCode,
      errorMessage: result.errorMessage || null,
      artifactFileIds,                 // [{id, name, mimeType}] — was missing!
    }).catch(() => { /* logged in pubsub */ });

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
    const p = await getPool();
    // Wait for all workers in the pool to finish booting so the first
    // user request doesn't pay the 3-5s warm-up cost inline.
    if (p && p.slots) {
      await Promise.allSettled(p.slots.map((s) => s.ready));
    }
    return p;
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
