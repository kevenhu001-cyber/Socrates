/** Warm Pyodide slots. A slot stays leased until its caller finishes cleanup. */
import { Worker } from 'node:worker_threads';
import { waitForSignal } from '../../lib/waitForSignal.js';
import { createSessionExecutionLock } from '../sessionExecutionLock.js';
import {
  EXEC_RUNNER,
  POOL_SIZE,
  PYODIDE_VERSION,
  WORKER_BOOT_TIMEOUT_MS,
  resolvePyodideWorkerEntry,
} from './config.js';
import { isRecord } from './values.js';

type PoolOptions = {
  size: number;
  spawnWorker?: () => Worker;
  bootTimeoutMs?: number;
};

function spawnPyodide() {
  const entry = resolvePyodideWorkerEntry();
  return new Worker(entry.file, {
    resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 },
    ...(entry.execArgv ? { execArgv: entry.execArgv } : {}),
  });
}

class WorkerSlot {
  worker: Worker | null = null;
  ready: Promise<void> | null = null;
  #isReady = false;
  #stopping = false;
  #exited: Promise<void> = Promise.resolve();
  #released: Promise<void> = Promise.resolve();
  #release: (() => void) | null = null;
  onRunFailure: ((error: Error) => void) | null = null;

  constructor(
    private readonly spawnWorker: () => Worker,
    private readonly bootTimeoutMs: number,
  ) {
    this.spawn();
  }

  private spawn() {
    const worker = this.spawnWorker();
    this.worker = worker;
    let exited!: () => void;
    this.#exited = new Promise<void>((resolve) => {
      exited = resolve;
    });
    this.ready = new Promise<void>((resolve, reject) => {
      let bootPending = true;
      const finish = (error?: Error) => {
        if (!bootPending) return;
        bootPending = false;
        clearTimeout(timer);
        worker.off('message', onBootMessage);
        if (error) {
          reject(Object.assign(error, { code: 'pyodide_worker_boot_failed' }));
          this.terminate();
        } else {
          this.#isReady = true;
          resolve();
        }
      };
      const onBootMessage = (message: unknown) => {
        if (!isRecord(message) || message.id !== 'boot') return;
        if (message.type === 'ready') finish();
        else finish(new Error(String(message.error || 'Pyodide boot failed')));
      };
      const timer = setTimeout(
        () => finish(new Error('pyodide_worker_boot_timeout')),
        this.bootTimeoutMs,
      );
      timer.unref();
      worker.on('message', onBootMessage);
      worker.on('error', (error) => {
        if (!this.#isReady && !this.#stopping) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
        // Wait for exit before rejecting an in-flight run. Its scratch
        // directory stays locked until the previous worker has stopped.
      });
      worker.once('exit', (code) => {
        const error = new Error(`pyodide_worker_exited: code=${code}`);
        if (bootPending) {
          bootPending = false;
          clearTimeout(timer);
          worker.off('message', onBootMessage);
          reject(Object.assign(error, { code: 'pyodide_worker_boot_failed' }));
        }
        this.worker = null;
        this.ready = null;
        this.#stopping = false;
        this.#isReady = false;
        exited();
        this.onRunFailure?.(error);
      });
    });
    // A prewarmed worker can fail before the first request joins it.
    void this.ready.catch(() => {
      /* The active or next claimant observes the boot failure. */
    });
  }

  tryClaim() {
    if (!this.#isReady || this.#release) return false;
    this.#released = new Promise<void>((resolve) => {
      this.#release = resolve;
    });
    return true;
  }

  async waitUntilAvailable() {
    if (this.#release) return this.#released;
    if (!this.worker) this.spawn();
    return this.#stopping ? this.#exited : this.ready!;
  }

  release() {
    const release = this.#release;
    this.#release = null;
    release?.();
  }

  terminate() {
    if (!this.worker || this.#stopping) return;
    this.#stopping = true;
    this.#isReady = false;
    void this.worker.terminate().catch(() => {
      /* The worker exit event owns cleanup. */
    });
  }
}

export class PyodidePool {
  readonly slots: WorkerSlot[];
  #nextStart = 0;

  constructor({
    size,
    spawnWorker = spawnPyodide,
    bootTimeoutMs = WORKER_BOOT_TIMEOUT_MS,
  }: PoolOptions) {
    if (!Number.isSafeInteger(size) || size < 1)
      throw new Error('Invalid Pyodide worker pool size');
    this.slots = Array.from({ length: size }, () => new WorkerSlot(spawnWorker, bootTimeoutMs));
  }

  async acquireSlot(signal?: AbortSignal) {
    for (;;) {
      signal?.throwIfAborted();
      for (let offset = 0; offset < this.slots.length; offset++) {
        const index = (this.#nextStart + offset) % this.slots.length;
        const slot = this.slots[index];
        if (slot.tryClaim()) {
          this.#nextStart = (index + 1) % this.slots.length;
          return slot;
        }
      }
      // Wake for whichever slot is available first. Waiting on one slot
      // can leave a different warm worker idle behind a long execution.
      try {
        await waitForSignal(
          Promise.any(this.slots.map((slot) => slot.waitUntilAvailable())),
          signal,
        );
      } catch (error) {
        if (error instanceof AggregateError) throw error.errors[0];
        throw error;
      }
    }
  }
}

let pool: PyodidePool | null = null;

/* Worker leases protect the runtime. This separate lock protects session files. */
export const sessionExecutionLock = createSessionExecutionLock();

export function getPool() {
  if (EXEC_RUNNER === 'disabled') return null;
  if (!pool) {
    pool = new PyodidePool({ size: POOL_SIZE });
    console.log(`[code-interpreter] warming ${POOL_SIZE} workers, Pyodide ${PYODIDE_VERSION}`);
  }
  return pool;
}
