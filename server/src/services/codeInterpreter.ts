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
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { executions, files } from '../db/schema.js';
import { recordAudit } from '../middleware/audit.js';
import { persistArtifact } from './util/fileArtifacts.js';
import { TooManyRequests } from '../lib/errors.js';
import { publish, subscribe as pubsubSubscribe, getStatus as pubsubStatus } from '../lib/pubsub.js';
import { parseChatSessionId, requireOwnedSession } from '../lib/sessionOwnership.js';
import { isUuid } from '../lib/validate.js';
import { createSessionExecutionLock } from './sessionExecutionLock.js';
import { MAX_TOOL_ARGUMENT_CHARS } from './toolCallSafety.js';

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
type ProgressListener = (event: any) => void;
type ProgressEvent = Record<string, unknown>;

export async function subscribeExecution(executionId: string, listener: ProgressListener) {
  return pubsubSubscribe(`exec_progress:${executionId}`, listener);
}

export function unsubscribeExecution(executionId: string, listener: ProgressListener) {
  /* No-op: pubsub's subscribe() returns its own unsubscribe handle
     that the caller should use. We keep the legacy sync API as a
     wrapper that returns undefined so the few places that ignore the
     return value (chat.js #1) still work. The full cleanup happens
     when the chat route closes the SSE connection and invokes the
     handle returned from subscribeExecution(). */
  void listener;
}

export async function subscribeExecutionResult(executionId: string, listener: ProgressListener) {
  return pubsubSubscribe(`exec_result:${executionId}`, listener);
}

export async function unsubscribeExecutionResult(executionId: string, listener: ProgressListener) {
  void listener;
}

/* Internal helper: emit a progress event to all subscribers (now
   potentially on other processes) AND forward to the call-site
   onProgress callback so the chat SSE stream can also stream progress
   inline. */
function emitProgress(executionId: string, event: ProgressEvent, onProgress?: ProgressListener | null) {
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
const DEFAULT_TIMEOUT_MS = parseInt(process.env.EXEC_TIMEOUT_MS_DEFAULT || '120000', 10);
const MAX_OUTPUT_BYTES = parseInt(process.env.EXEC_MAX_OUTPUT_BYTES || '65536', 10);
const MAX_ARTIFACT_BYTES = parseInt(process.env.EXEC_MAX_ARTIFACT_BYTES || '10485760', 10);
/* P_code-size-cap — cap the source a single execution can carry so
   neither the `executions.code` row nor the in-memory worker buffer
   can be weaponised into a deniability-of-storage surface. The chat
   schema already caps message content at 200 KB; we mirror that for
   the tool's own code argument. */
const MAX_CODE_CHARS = parseInt(process.env.EXEC_MAX_CODE_CHARS || '200000', 10);
/* The transport layer rejects tool-call arguments above
 * MAX_TOOL_ARGUMENT_CHARS (80 KB) before this executor ever sees them, so
 * the advertised schema must not promise more — a model writing to the
 * documented limit would otherwise be turned away as malformed. ~8 KB of
 * headroom covers JSON escaping of the code string plus sibling fields. */
const ADVERTISED_MAX_CODE_CHARS = Math.min(MAX_CODE_CHARS, MAX_TOOL_ARGUMENT_CHARS - 8192);
const SCRATCH_DIR = process.env.EXEC_SCRATCH_DIR
  || (process.env.NODE_ENV === 'production' ? '/var/lib/socrates/exec' : path.join(os.tmpdir(), 'socrates-exec'));

/* Scratch paths are owner-namespaced as defense in depth. Route and service
 * ownership checks remain mandatory, but a future missed predicate can no
 * longer make two users resolve the same on-disk directory for one session
 * ID. Session IDs are globally unique, yet user scoping makes the filesystem
 * boundary match the database/files API boundary as well. */
function sessionScratchPath(userId: string, sessionId: string) {
  return path.join(SCRATCH_DIR, userId, sessionId);
}

function executionScratchPath(userId: string, executionId: string) {
  return path.join(SCRATCH_DIR, userId, 'executions', executionId);
}

interface PyodideWorkerEntry {
  file: string;
  execArgv?: string[];
}

/** Resolve the worker for both source-mode and compiled production runs. */
export function resolvePyodideWorkerEntry(): PyodideWorkerEntry {
  const compiled = path.join(__dirname, 'pyodideWorker.js');
  if (existsSync(compiled)) return { file: compiled };

  const source = path.join(__dirname, 'pyodideWorker.ts');
  if (existsSync(source)) {
    return {
      file: source,
      // Worker threads do not reliably inherit tsx's source resolver.
      execArgv: [...process.execArgv, '--import', 'tsx'],
    };
  }

  throw new Error(`pyodide_worker_entry_missing: neither ${compiled} nor ${source} exists`);
}

/* Make sure the scratch root exists before any worker is spawned. */
await fs.mkdir(SCRATCH_DIR, { recursive: true }).catch(() => {});

/* ─── Tool definition (sent to upstream on every chat turn) ─── */
export const CODE_INTERPRETER_TOOL = {
  type: 'function',
  function: {
    name: 'code_interpreter',
    description:
      '## What this tool does\n' +
      'Executes Python 3.12 in a sandboxed Pyodide WASM runtime and returns stdout plus any matplotlib PNGs / CSV exports written to the current working directory.\n\n' +
      // P_code-must-be-module-level — the runner is
      // `exec(compile(src, "<socrates>", "exec"), {"__name__": "__main__"})`.
      // This is a SYNCHRONOUS module-level exec, not a Jupyter cell. The
      // model used to hit `SyntaxError: 'await' outside function` and
      // similar compile-time errors on the first attempt, wasting a
      // round trip. These rules are stated up-front so the model writes
      // valid Python on the first try.
      '## Source must be valid module-level Python (NOT a Jupyter cell)\n' +
      '- **No top-level `await`.** This runner is synchronous. For async work, write `async def main(): ...` and call `asyncio.run(main())`. The same applies to top-level `yield` (it must be inside a generator function).\n' +
      '- **No top-level `return value`.** `return` with a value is only valid inside a function. If you want a final result, print it.\n' +
      '- **No `break`/`continue` outside loops.** If you need early exit, use `return` inside a function or `sys.exit(N)` at the top level.\n' +
      '- **Indentation must form valid compound statements.** Every `def`, `for`, `if`, `try`, `with`, `while`, `class` needs a properly indented body. Empty bodies need `pass` or `...`.\n' +
      `- **Never call \`input()\`.** There is no stdin — it blocks until the ${DEFAULT_TIMEOUT_MS / 1000}s timeout. Pass data as a literal, read from a file in \`/artifacts\`, or generate it inline.\n` +
      '- **Never call `plt.show()`.** matplotlib is pinned to `Agg` (no GUI). Use `plt.savefig("name.png", ...)` and the file will be returned as an artifact.\n' +
      '- **Never use `pip install`.** This is WASM; no `subprocess`, no network. Use `import micropip; micropip.install("pkg")` at the top of the run. Pyodide ships numpy, pandas, matplotlib, seaborn pre-installed.\n' +
      '- **Group multi-step work in a single call.** Several independent calculations belong in one `code` body — the runner is one exec per tool call, and the per-turn tool-call budget (stated in the native-tool contract) is finite.\n\n' +
      '## When to call\n' +
      '- Arithmetic, unit conversion, numeric verification, solving an equation, "is X > Y".\n' +
      '- Complex computation, user-file analysis, data preprocessing, or explicitly requested CSV/PNG exports. For ordinary inline charts and function graphs, use render_visualization instead.\n' +
      '- Small data-exploration snippets (load inline data, summarize, sample-check a derivation).\n\n' +
      '## When NOT to call\n' +
      '- Illustrations of concrete subjects (animals, people, scenes, logos, icons) — those MUST go through render_visualization with the svg_illustration template. SVG output here is rejected with `illustration_not_supported`. Never use code_interpreter for illustrations.\n' +
      '- Conceptual answers, code review, prose, explanations — answer those directly in markdown.\n' +
      '- Trivial single-step arithmetic you can do in your head.\n\n' +
      `## Limits\n` +
      `- Timeout: ${DEFAULT_TIMEOUT_MS / 1000}s default. Worker is killed if exceeded → status returns \`timeout\`.\n` +
      `- stdout / stderr capped at ${MAX_OUTPUT_BYTES / 1024} KB each per stream; exceeding it returns \`output_limit_exceeded\`.\n` +
      `- Source capped at ${Math.floor(ADVERTISED_MAX_CODE_CHARS / 1024)} KB; oversized source returns \`code_too_large\` or \`invalid_tool_arguments\` before any execution. Split long programs into multiple calls.\n` +
      '- No subprocess, no network fetch from Python, no host filesystem access.\n\n' +
      '## Filesystem\n' +
      '- cwd is `/artifacts`, mapped to a session-scoped scratch dir that persists across every code call in this conversation.\n' +
      '- Each run prints a `[scratch] cwd=/artifacts, files (sorted by mtime desc):` header listing current files with size + age. READ THE HEADER before guessing any path. If the header shows no matching file, write the file yourself in the same run — do not assume it exists.\n' +
      '- Files persist; the directory is only reaped on session delete or a 14-day TTL sweep.\n\n' +
      '## State across calls\n' +
      '**Files persist. EVERYTHING ELSE DOES NOT.** Imports, function definitions, variables, module-level state — all reset between calls. Re-import or recompute anything you need; do not rely on a variable from a previous run.\n\n' +
      '## matplotlib guidance\n' +
      '- Backend is pinned to `Agg` (no display). Figures render headless.\n' +
      '- A CJK-capable font (Noto Sans SC) is pre-installed and registered at boot; Chinese / Japanese / Korean characters in titles, labels, and legends render correctly without any extra setup. Do NOT call `matplotlib.rcParams["font.sans-serif"] = […]` or `matplotlib.font_manager.fontManager.addfont(…)` — leave the defaults alone so the pre-installed font stays active.\n' +
      '- Save with `plt.savefig("name.png", dpi=120, bbox_inches="tight")` — dpi=120 keeps PNGs under ~500 KB at typical sizes; bbox_inches="tight" crops margins.\n' +
      '- Always call `plt.tight_layout()` before savefig or labels get clipped.\n' +
      '- Close figures (`plt.close("all")` or `plt.close(fig)`) after saving — otherwise memory grows across runs.\n\n' +
      '## Common errors and how to recover\n' +
      '- `SyntaxError` (any kind) → check indentation and module-level syntax. In particular, keep `await` inside an `async def` invoked with `asyncio.run(...)`.\n' +
      '- `NameError: name X is not defined` → X was a variable from a previous run. Recompute it in THIS run, do not just re-call.\n' +
      '- `ModuleNotFoundError` → install with `import micropip; micropip.install("pkg")` at the top of the run.\n' +
      '- `FileNotFoundError` → you guessed a path without reading the `[scratch]` header. Re-read the header; if the file is not listed, write it yourself in this run.\n' +
      '- `output_limit_exceeded` → stdout was too verbose. Save the data to a file, print a summary, describe the summary.\n' +
      '- `timeout` (status field) → the work exceeded the time budget. Split into smaller runs or pre-compute what you can.\n' +
      '- Empty PNG / "figure not found" → forgot `plt.close()` from the previous run; close all figures at the top of this run.',
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
            description: `Python source code to execute (max ${Math.floor(ADVERTISED_MAX_CODE_CHARS / 1024)} KB — split longer programs into multiple calls). Files written to disk (matplotlib.savefig, open(..., "w"), pandas.to_csv) persist across every code call in this conversation — the scratch dir is session-scoped.`,
            maxLength: ADVERTISED_MAX_CODE_CHARS,
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
  index: number;
  pool: PyodidePool;
  busy: boolean;
  worker: Worker | null;
  ready: Promise<void> | null;
  failedBoots: number;
  terminated: boolean;
  _readyResolved: boolean;
  _readyReject: ((reason?: unknown) => void) | null;
  _inflightReject: ((reason?: any) => void) | null;
  _claimChain: Promise<void>;
  _releaseCurrent: (() => void) | null;
  constructor({ index, pool }: { index: number; pool: PyodidePool }) {
    this.index = index;
    this.pool = pool;
    this.busy = false;
    this.worker = null;
    this.ready = null;
    this.failedBoots = 0;
    this.terminated = false;
    this._readyResolved = false;
    this._readyReject = null;
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
    const entry = resolvePyodideWorkerEntry();
    const w = new Worker(entry.file, {
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 32,
      },
      ...(entry.execArgv ? { execArgv: entry.execArgv } : {}),
    });
    this.worker = w;
    this._readyResolved = false;
    const bootFailure = (value: unknown) => {
      const source = value instanceof Error ? value : new Error(String(value || 'pyodide boot failed'));
      const error = new Error(source.message || 'pyodide boot failed') as Error & { code?: string; status?: string };
      error.code = 'pyodide_worker_boot_failed';
      error.status = 'failed';
      return error;
    };
    this.ready = new Promise<void>((resolve, reject) => {
      this._readyReject = (reason?: unknown) => reject(bootFailure(reason));
      const onMessage = (msg: any) => {
        if (msg && msg.id === 'boot') {
          w.off('message', onMessage);
          if (msg.type === 'ready') {
            this._readyResolved = true;
            this._readyReject = null;
            resolve();
          } else {
            const rejectReady = this._readyReject;
            this._readyReject = null;
            if (rejectReady) rejectReady(msg.error || 'pyodide boot failed');
          }
        }
      };
      w.on('message', onMessage);
      w.on('error', (err) => {
        const rejectReady = this._readyReject;
        this._readyReject = null;
        if (rejectReady) rejectReady(err);
      });
    });
    w.on('exit', (code: number) => {
      const wasBusy = this.busy;
      this.worker = null;
      this.ready = null;
      this._readyResolved = false;
      if (this._readyReject) {
        const rejectReady = this._readyReject;
        this._readyReject = null;
        rejectReady(new Error(`pyodide_worker_exited_before_ready: code=${code}`));
      }
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
    let resolveNextRelease: any;
    this._claimChain = new Promise<void>((resolve) => { resolveNextRelease = resolve; });
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
      // Worker is dead (crashed without terminate()) — spawn a
      // replacement. Without this, the exit handler sets worker=null
      // and ready=null, so tryClaim() returns false forever, and
      // _claimChain resolves immediately — creating a CPU-burning
      // infinite spin loop until failedBoots > 3.
      if (!this.worker && !this.terminated) {
        this.terminated = false;
        this.failedBoots = 0;
        this.spawn();
        // Wait for the new worker to boot before retrying
        if (this.ready) await this.ready;
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
  _installReleaseTrap(resolveNextRelease: (() => void) | null) {
    let resolveRelease: any;
    const myRelease = new Promise<void>((resolve) => { resolveRelease = resolve; });
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
  slots: WorkerSlot[];
  _nextStart: number;
  constructor({ size }: { size: number }) {
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
  _onSlotDied(slot: WorkerSlot, code: number) {
    // Rejection is now handled per-slot in the WorkerSlot exit handler.
    // The pool-level _inflightReject was removed because concurrent
    // executions on different slots could overwrite each other's
    // reject handler. Each WorkerSlot tracks its own _inflightReject.
  }
}

let pool: PyodidePool | null = null;
let _poolInitLock: Promise<void> | null = null;

/* A pool slot only prevents two calls from sharing one worker. This separate
 * lock protects the mutable scratch directory shared by one conversation. */
const sessionExecutionLock = createSessionExecutionLock();
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
interface Artifact {
  name: string;
  size: number;
  absPath: string;
  [k: string]: unknown;
}
interface WorkerResult {
   status?: string;
   stdout?: string;
   stderr?: string;
   exitCode?: number;
   durationMs?: number;
   errorMessage?: string;
   errorCode?: string;
   artifacts?: Artifact[];
   [k: string]: unknown;
 }
async function runOnWorker({ executionId, code, timeoutMs, signal, scratchDir, maxOutputBytes, onProgress }: {
  executionId: string;
  code: string;
  timeoutMs?: number;
  signal?: AbortSignal | null;
  scratchDir: string;
  maxOutputBytes?: number;
  onProgress?: ProgressListener | null;
}) {
  const startedAt = Date.now();
  /* P_progress — safe noop default so existing callers (tests, direct
     execute()) work without changes. */
  const emit = (typeof onProgress === 'function')
    ? (p: any) => { try { onProgress!(p); } catch (_) {} }
    : () => {};
    const pool = await getPool();
    /* P_progress — surface the wait while a worker is busy/booting. */
    emitProgress(executionId, { phase: 'queued', executionId }, onProgress);
    const slot = await pool!.acquireSlot();
    emitProgress(executionId, { phase: 'ready', executionId }, onProgress);
  // slot.tryClaim()/claim() already returned a fully-claimed slot with
  // a booted worker, so slot.worker is ready — no second await needed.
  const worker = slot.worker!;
  const id = crypto.randomUUID();
  const interruptBuffer = new SharedArrayBuffer(8);

  const timeout = Math.max(100, timeoutMs || DEFAULT_TIMEOUT_MS);
  let timedOut = false;
  let cancelledByCaller = false;

  // SIGINT path: works for I/O-bound code (time.sleep, file reads, etc).
  // Doesn't work for CPU-bound pure-Python loops — those need termination.
  // Progressive timeout warnings — notify listeners at 50%, 80%, and 95%
  // of the budget so the UI can show "still running…" instead of silence.
  const timeoutCheckpoints = [
    { at: 0.50, label: '50%' },
    { at: 0.80, label: '80%' },
    { at: 0.95, label: '95%' },
  ];
  const timeoutWarnings: NodeJS.Timeout[] = [];
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
    timedOut = true;
    try { new Uint8Array(interruptBuffer)[0] = 0x02; } catch (_) {}
  }, timeout);

  // Hard termination fallback: if SIGINT hasn't returned within timeout + 1s,
  // terminate the worker. The slot's exit handler rejects the in-flight
  // promise and respawns on next acquire.
  const terminateTimer = setTimeout(() => {
    slot.terminate();
  }, timeout + 1000);

  try {
    const result = await new Promise<any>((resolve, reject) => {
      slot._inflightReject = reject; // per-slot, not pool._inflightReject
      const onAbort = () => {
        cancelledByCaller = true;
        try { new Uint8Array(interruptBuffer)[0] = 0x02; } catch (_) {}
      };
      if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
      const onMessage = (msg: any) => {
        if (!msg || msg.id !== id) return;
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
          // Clear termination timers immediately so a concurrent
          // terminateTimer fire doesn't kill the worker after a
          // normal completion (race between resolve and finally).
          clearTimeout(sigintTimer);
          clearTimeout(terminateTimer);
          for (const t of timeoutWarnings) clearTimeout(t);
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
    if (cancelledByCaller && result && result.status === 'timeout') {
      result.status = 'cancelled';
      result.errorMessage = 'cancelled_by_caller';
      result.exitCode = 130;
    } else if (!timedOut && result && result.status === 'timeout') {
      // A user-raised KeyboardInterrupt is not a tool timeout.
      result.status = 'failed';
      result.errorMessage = 'worker_interrupt';
      result.exitCode = 130;
    }
    return result;
  } catch (err) {
    const incoming = err as Error & { code?: string; status?: string; durationMs?: number };
    const message = String(incoming && incoming.message || err);
    const incomingStatus = incoming.status;
    const incomingCode = incoming.code;
    const mappedStatus = incomingStatus || (cancelledByCaller ? 'cancelled' : timedOut ? 'timeout' : 'failed');
    const mapped = new Error(
      cancelledByCaller
        ? 'cancelled_by_caller'
        : timedOut
          ? 'execution_timeout'
          : message,
    ) as Error & { code?: string; status?: string; durationMs?: number };
    mapped.code = incomingCode || (cancelledByCaller
      ? 'execution_cancelled'
      : timedOut
        ? 'execution_timeout'
        : /pyodide_worker_exited|pyodide_worker_entry_missing|Worker/i.test(message)
          ? 'pyodide_worker_failed'
          : 'code_execution_failed');
    mapped.status = mappedStatus;
    mapped.durationMs = incoming.durationMs ?? Date.now() - startedAt;
    throw mapped;
  } finally {
    clearTimeout(sigintTimer);
    clearTimeout(terminateTimer);
    for (const t of timeoutWarnings) clearTimeout(t);
    slot.release();
  }
}

/* ─── Public execute() — the surface the chat route calls ─── */
interface ExecuteOpts {
  userId?: string | null;
  sessionId?: string | null;
  language?: string;
  code?: string;
  timeoutMs?: number;
  signal?: AbortSignal | null;
  onProgress?: ProgressListener | null;
}

type ExecutionResponse = {
  executionId?: string;
  status: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string | null;
  artifacts?: unknown[];
  artifactFileIds: Array<{ id?: string; name?: string; mimeType?: string | null }>;
  artifactCount: number;
};

async function executeCode(opts: ExecuteOpts): Promise<ExecutionResponse> {
  const requestStartedAt = Date.now();
  if (EXEC_RUNNER === 'disabled') {
    /* P_progress — still emit a terminal so the chat route can
       clear its "queued" spinner even on the disabled path. */
    if (typeof opts.onProgress === 'function') {
      try { opts.onProgress({ phase: 'skipped', reason: 'runner_disabled' }); } catch (_) {}
    }
    return {
      status: 'skipped',
      errorCode: 'code_interpreter_disabled',
      errorMessage: 'code_interpreter_disabled',
      durationMs: Math.max(1, Date.now() - requestStartedAt),
      artifactFileIds: [],
      artifactCount: 0,
    };
  }
  const userId = opts.userId || null;
  const sessionId = opts.sessionId || null;
  const code = String(opts.code || '');
  const language = opts.language || 'python';
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const signal = opts.signal || null;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

  /* P_exec-missing-user — the `executions.user_id` column is
   * NOT NULL and references users(id). When a caller (currently
   * the chat SSE route) hands us `opts.userId` of null/undefined,
   * the previous code coerced it to null and let the INSERT fail
   * at the DB layer with a confusing "Failed query: insert into
   * executions… params: ,,…" that the model surfaced verbatim.
   * Fail fast here with a structured error so the chat route can
   * log it cleanly and tell the user that the request was not
   * authenticated. Catching this at the boundary also makes the
   * tool behave predictably if it is ever called from a context
   * without an authenticated user (background job, test, etc). */
  if (!userId) {
    if (typeof onProgress === 'function') {
      try { onProgress({ phase: 'skipped', reason: 'missing_user' }); } catch (_) {}
    }
    return {
      status: 'failed',
      errorCode: 'missing_user',
      errorMessage: 'missing_user: code_interpreter requires an authenticated user (req.userId was not set on the call)',
      stdout: '', stderr: '', exitCode: 1,
      durationMs: Math.max(1, Date.now() - requestStartedAt),
      artifacts: [], artifactFileIds: [], artifactCount: 0,
    };
  }

  /* A direct service caller must meet the same session contract as the SSE
     route. This is critical defense in depth: otherwise a future route could
     accidentally reintroduce cross-user scratch access by calling execute()
     with an arbitrary sessionId. */
  let validatedSessionId: string | null;
  try {
    validatedSessionId = parseChatSessionId(sessionId);
    if (validatedSessionId) {
      await requireOwnedSession(getDb(), validatedSessionId, userId);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'invalid_session';
    if (typeof onProgress === 'function') {
      try { onProgress({ phase: 'skipped', reason: 'invalid_session' }); } catch (_) {}
    }
    return {
      status: 'failed',
      errorCode: 'session_not_owned',
      errorMessage,
      stdout: '', stderr: '', exitCode: 1,
      durationMs: Math.max(1, Date.now() - requestStartedAt),
      artifacts: [], artifactFileIds: [], artifactCount: 0,
    };
  }

  /* P_code-size-cap — reject oversized sources BEFORE we touch
     the database, the scratch dir, or the worker pool. The user
     sees a stable 'failed/code_too_large' status and we never
     persist a 10 MB `executions.code` row. */
  if (code.length > MAX_CODE_CHARS) {
    const maxKb = Math.round(MAX_CODE_CHARS / 1024);
    return {
      status: 'failed',
      errorCode: 'code_too_large',
      errorMessage: `code_too_large: source exceeds ${maxKb} KB limit`,
      stdout: '',
      stderr: '',
      exitCode: 1,
      durationMs: Math.max(1, Date.now() - requestStartedAt),
      artifacts: [],
      artifactFileIds: [],
      artifactCount: 0,
    };
  }

  const executionStartedAt = Date.now();
  let pool: PyodidePool | null;
  try {
    pool = await getPool();
  } catch (err) {
    const errorMessage = String(err && (err as Error).message || err);
    return {
      status: 'failed',
      errorCode: 'pyodide_worker_boot_failed',
      errorMessage,
      stdout: '',
      stderr: '',
      exitCode: 1,
      durationMs: Math.max(1, Date.now() - executionStartedAt),
      artifacts: [],
      artifactFileIds: [],
      artifactCount: 0,
    };
  }
  if (!pool) {
    return {
      status: 'skipped',
      errorCode: 'code_interpreter_disabled',
      errorMessage: 'code_interpreter_disabled',
      artifactFileIds: [],
      artifactCount: 0,
    };
  }

  const db = getDb();

  // Insert the running row up front so we have an ID for foreign keys
  // and so the row exists even if the worker crashes mid-run.
  const [inserted] = await db.insert(executions).values({
    userId,
    sessionId: validatedSessionId,
    language,
    code,
    status: 'running',
    startedAt: new Date(),
  }).returning();
  const executionId = inserted.id;

  /* P_session-scoped-scratch — files written by an earlier execution
     in the same conversation remain available in the next run's
     cwd. Without this, the model would write transcendental.png in
     run N, then FileNotFoundError on the same path in run N+1.
     The session-scoped dir lives under SCRATCH_DIR/<sessionId> and
     is reused across every execution in the conversation. Reaping
     is deferred to session-delete (deleteSession routes) plus a
     boot-time TTL sweep for orphaned sessions. */
  const sessionScratchDir = validatedSessionId
    ? sessionScratchPath(userId, validatedSessionId)
    : executionScratchPath(userId, executionId);
  let result: WorkerResult;
  try {
    await fs.mkdir(sessionScratchDir, { recursive: true });
    /* P_scratch-header — prepend a small stdout header that lists
       the current files in the scratch dir so the AI knows what's
       available without guessing. This runs BEFORE the user's code
       so the listing appears at the top of stdout. Use a unique
       marker name that cannot collide with user code. */
    const scratchMarker = '___socrates_scratch_' + executionId.replace(/-/g, '_') + '___';
    const scratchHeader = 'import os; ' + scratchMarker + ' = os.getcwd(); print(f\'[scratch] cwd: {os.listdir(' + scratchMarker + ') if os.path.isdir(' + scratchMarker + ') else "(not a dir)"}\')';
    const wrappedCode = code.includes(scratchMarker) ? code : scratchHeader + '\n' + code;
    result = await runOnWorker({
      executionId,
      code: wrappedCode,
      timeoutMs,
      signal,
      scratchDir: sessionScratchDir,
      maxOutputBytes: MAX_OUTPUT_BYTES,
      onProgress,
    });
  } catch (err) {
    const typed = err as Error & { code?: string; status?: string; durationMs?: number };
    const msg = String(typed && typed.message || err);
    const status = typed.status || 'failed';
    const errorCode = typed.code || (status === 'timeout' ? 'execution_timeout' : 'code_execution_failed');
    result = {
      status,
      errorCode,
      errorMessage: status === 'timeout'
        ? 'execution_timeout'
        : status === 'cancelled'
          ? 'cancelled_by_caller'
          : msg,
      stdout: '',
      stderr: '',
      exitCode: status === 'timeout' ? 124 : status === 'cancelled' ? 130 : 1,
      durationMs: Math.max(1, typed.durationMs ?? Date.now() - executionStartedAt),
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
      durationMs: result.durationMs,
      errorCode: result.errorCode,
    }).catch(() => { /* logged in pubsub */ });
  }

  // Persist artifacts. Each file in result.artifacts is something the
  // user's Python wrote into the artifacts/ subdir.
  const artifactFileIds: Array<{ id?: string; name?: string; mimeType?: string | null }> = [];
  const persistedArtifacts: any[] = [];
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
        sessionId: validatedSessionId,
        executionId,
        sourcePath: art.absPath,
        originalName: art.name,
        size: art.size,
      });
      artifactFileIds.push({ id: fileId, name: art.name, mimeType });
      persistedArtifacts.push({ ...art, fileId, mimeType });
    } catch (err) {
      persistedArtifacts.push({ ...art, error: String(err && (err as Error).message || err) });
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
  recordAudit(userId, 'code_execution', {
    executionId,
    language,
    status: finalStatus,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    artifactCount: finalArtifactCount,
    errorMessage: result.errorMessage || null,
  }).catch(() => {});

  // P_session-scoped-scratch — files in the session scratch dir
  // outlive this run; they're reaped only when the session is
  // deleted (see _reapSessionScratch below) or by the TTL sweep at
  // boot for orphaned sessions whose conversation was abandoned.
  // fs.rm(executionScratchDir, …) intentionally removed.

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
    errorCode: result.errorCode,
    artifactFileIds,                 // [{id, name, mimeType}] — was missing!
  }).catch(() => { /* logged in pubsub */ });

  return {
    executionId,
    status: finalStatus,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage || null,
    artifactFileIds,                 // [{id, name, mimeType}]
    artifactCount: finalArtifactCount,
  };
}
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
  async execute(opts: ExecuteOpts): Promise<ExecutionResponse> {
    const rawSessionId = opts.sessionId || null;
    /* Serialize full execution lifecycles, including artifact persistence.
       Doing only runOnWorker() would still let a later call observe a file
       before its predecessor had copied/recorded the corresponding artifact. */
    return sessionExecutionLock.run(rawSessionId, () => executeCode(opts));
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
  _internal: {
    sessionExecutionLock,
  },

  /* P_session-scoped-scratch — delete the session's scratch dir
     when the conversation is deleted. Best-effort: filesystem may
     already be gone (TTL sweep, server crash, etc.). Safe to call
     repeatedly. */
  async reapSessionScratch(sessionId?: string | null, userId?: string | null) {
    if (!sessionId || !isUuid(sessionId)) return;
    if (userId && isUuid(userId)) {
      await fs.rm(sessionScratchPath(userId, sessionId), { recursive: true, force: true }).catch(() => {});
      return;
    }

    /* Compatibility for callers that only know the session ID. We never use
       this path for execution; it merely clears legacy root-layout dirs and
       discovers the owner namespace during deletion/cleanup. UUID validation
       above keeps every joined path beneath SCRATCH_DIR. */
    await fs.rm(path.join(SCRATCH_DIR, sessionId), { recursive: true, force: true }).catch(() => {});
    let owners: import('node:fs').Dirent[] = [];
    try { owners = await fs.readdir(SCRATCH_DIR, { withFileTypes: true }); } catch { return; }
    await Promise.all(owners
      .filter((entry) => entry.isDirectory() && isUuid(entry.name))
      .map((entry) => fs.rm(path.join(SCRATCH_DIR, entry.name, sessionId), { recursive: true, force: true }).catch(() => {})));
  },

  async reapExecutionScratch(executionId?: string | null, userId?: string | null) {
    if (!executionId || !userId || !isUuid(executionId) || !isUuid(userId)) return;
    await fs.rm(executionScratchPath(userId, executionId), { recursive: true, force: true }).catch(() => {});
  },

  /* TTL sweep — remove session dirs whose conversation hasn't run
     any code in EXEC_SCRATCH_TTL_DAYS days. Called once at server
     boot (index.js). Uses the session dir's mtime as the freshness
     signal: every run touches the dir, so an active session stays
     alive and a closed tab drops off after the TTL. */
  async _reapStaleSessionScratches(ttlDays?: number) {
    const days = Number.isFinite(ttlDays) && (ttlDays as number) > 0 ? (ttlDays as number) : 7;
    const ttlMs = days * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - ttlMs;
    let removed = 0;
    const reapIfStale = async (dir: string) => {
      try {
        const st = await fs.stat(dir);
        if (st.mtimeMs >= cutoff) return;
        await fs.rm(dir, { recursive: true, force: true });
        removed++;
      } catch (_) { /* skip — race with delete or transient ENOENT */ }
    };
    const visit = async (dir: string, depth: number): Promise<void> => {
      let entries: import('node:fs').Dirent[];
      try { entries = await fs.readdir(dir, { withFileTypes: true }); }
      catch (_) { return; }
      // A scratch root always owns an artifacts child. Treat it as a leaf
      // rather than recursing into artifact files themselves.
      if (entries.some((entry) => entry.isDirectory() && entry.name === 'artifacts')) {
        await reapIfStale(dir);
        return;
      }
      /* Direct UUID children of SCRATCH_DIR are ambiguous during the
         migration: old installs used <root>/<session>, while the new layout
         uses <root>/<user>. A legacy session has an artifacts child and was
         handled above. Otherwise treat this level as an owner namespace so
         an active user's directory is never reaped merely because the parent
         mtime is older than its active session child. */
      if (depth >= 2 && isUuid(path.basename(dir))) {
        await reapIfStale(dir);
        return;
      }
      // New layout is <user>/<session> or <user>/executions/<execution>.
      // Keep a small finite walk so malformed filesystem contents cannot turn
      // a periodic cleanup into an unbounded recursive scan.
      if (depth >= 3) return;
      await Promise.all(entries
        .filter((entry) => entry.isDirectory() && (isUuid(entry.name) || entry.name === 'executions'))
        .map((entry) => visit(path.join(dir, entry.name), depth + 1)));
    };
    try { await visit(SCRATCH_DIR, 0); }
    catch (e) { return { removed: 0, error: String(e && (e as Error).message || e) }; }
    if (removed > 0) console.log(`[code-interpreter] TTL sweep reaped ${removed} stale session scratch dir(s) (older than ${days}d)`);
    return { removed };
  },
};
