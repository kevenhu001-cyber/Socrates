/**
 * Pyodide worker pool: one worker per slot, round-robin claims, FIFO waiters,
 * and the session scratch lock shared by executions in one conversation.
 */
import { Worker } from 'node:worker_threads';
import { createSessionExecutionLock } from '../sessionExecutionLock.js';
import { EXEC_RUNNER, POOL_SIZE, PYODIDE_VERSION, resolvePyodideWorkerEntry } from './config.js';
import { isRecord } from './values.js';

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
  _inflightReject: ((reason?: unknown) => void) | null;
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
      const source =
        value instanceof Error ? value : new Error(String(value || 'pyodide boot failed'));
      const error = new Error(source.message || 'pyodide boot failed') as Error & {
        code?: string;
        status?: string;
      };
      error.code = 'pyodide_worker_boot_failed';
      error.status = 'failed';
      return error;
    };
    this.ready = new Promise<void>((resolve, reject) => {
      this._readyReject = (reason?: unknown) => reject(bootFailure(reason));
      const onMessage = (msg: unknown) => {
        if (isRecord(msg) && msg.id === 'boot') {
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
    let resolveNextRelease!: () => void;
    this._claimChain = new Promise<void>((resolve) => {
      resolveNextRelease = resolve;
    });
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
    let resolveRelease!: () => void;
    const myRelease = new Promise<void>((resolve) => {
      resolveRelease = resolve;
    });
    this._releaseCurrent = resolveRelease;
    myRelease
      .then(() => {
        this.busy = false;
        this._releaseCurrent = null;
        if (resolveNextRelease) resolveNextRelease();
      })
      .catch(() => {});
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
      /* terminate() resolves when the worker exits; the exit handler below is
         what clears worker/busy. A rejection here is not actionable. */
      try {
        this.worker.terminate().catch(() => {});
      } catch (_) {}
    }
    if (this._releaseCurrent) {
      const r = this._releaseCurrent;
      this._releaseCurrent = null;
      r();
    }
  }
}

export class PyodidePool {
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
export const sessionExecutionLock = createSessionExecutionLock();
/* P_pool-retry — `_poolInitLock` was previously a Promise that, on
   failure, was never cleared. Every subsequent getPool() call would
   await the same rejected promise and re-throw, permanently disabling
   the executor. We now wrap the IIFE in try/finally so a transient
   boot failure (e.g. the worker file was briefly unreadable) lets the
   next caller retry. Concurrent first-callers still share a single
   in-flight init via the captured promise. */
export async function getPool() {
  if (pool) return pool;
  if (EXEC_RUNNER === 'disabled') return null;
  if (!_poolInitLock) {
    _poolInitLock = (async () => {
      try {
        pool = new PyodidePool({ size: POOL_SIZE });
        console.log(
          `[code-interpreter] pool ready (${POOL_SIZE} workers, pyodide ${PYODIDE_VERSION})`,
        );
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
