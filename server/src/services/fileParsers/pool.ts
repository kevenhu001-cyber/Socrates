/**
 * File parser worker pool: runs CPU-intensive office and document extractions
 * in worker threads so the main event loop remains free for low-latency SSE turns.
 */
import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dispatchParser, type ExtractResult } from './dispatcher.js';
import { parseError, type ParseErrorCode } from './text.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POOL_SIZE = Math.max(1, parseInt(process.env.FILE_PARSER_POOL_SIZE || '2', 10));
const PARSE_TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.FILE_PARSER_TIMEOUT_MS || '30000', 10),
);

interface WorkerEntry {
  file: string;
  execArgv?: string[];
}

export function resolveWorkerEntry(): WorkerEntry {
  const compiled = path.join(__dirname, 'worker.js');
  if (existsSync(compiled)) return { file: compiled };

  const source = path.join(__dirname, 'worker.ts');
  if (existsSync(source)) {
    return {
      file: source,
      execArgv: ['--import', 'tsx'],
    };
  }

  throw new Error(`file_parser_worker_entry_missing: neither ${compiled} nor ${source} exists`);
}

export class WorkerSlot {
  index: number;
  pool: FileParserPool;
  busy: boolean;
  worker: Worker | null;
  ready: Promise<void> | null;
  terminated: boolean;
  failedBoots: number;
  customEntry?: WorkerEntry;
  _readyResolved: boolean;
  _readyReject: ((reason?: unknown) => void) | null;
  _inflightReject: ((reason?: unknown) => void) | null;
  _claimChain: Promise<void>;
  _releaseCurrent: (() => void) | null;

  constructor(index: number, pool: FileParserPool, customEntry?: WorkerEntry) {
    this.index = index;
    this.pool = pool;
    this.customEntry = customEntry;
    this.busy = false;
    this.worker = null;
    this.ready = null;
    this.terminated = false;
    this.failedBoots = 0;
    this._readyResolved = false;
    this._readyReject = null;
    this._inflightReject = null;
    this._claimChain = Promise.resolve();
    this._releaseCurrent = null;
  }

  spawn(): Promise<void> {
    if (this.worker && this.ready) return this.ready;

    let entry: WorkerEntry;
    if (this.customEntry) {
      entry = this.customEntry;
    } else {
      try {
        entry = resolveWorkerEntry();
      } catch (err) {
        this.failedBoots++;
        return Promise.reject(err);
      }
    }

    const w = new Worker(entry.file, {
      resourceLimits: {
        maxOldGenerationSizeMb: 512,
        maxYoungGenerationSizeMb: 64,
      },
      ...(entry.execArgv ? { execArgv: entry.execArgv } : {}),
    });

    this.worker = w;
    this._readyResolved = false;

    this.ready = new Promise<void>((resolve, reject) => {
      this._readyReject = reject;
      const onMessage = (msg: unknown) => {
        if (msg && typeof msg === 'object' && 'type' in msg && msg.type === 'ready') {
          this._readyResolved = true;
          this._readyReject = null;
          w.off('message', onMessage);
          w.unref?.();
          resolve();
        }
      };
      w.on('message', onMessage);
      w.on('error', (err) => {
        if (this._readyReject) {
          const r = this._readyReject;
          this._readyReject = null;
          r(err);
        }
      });
    });

    w.on('exit', (code: number) => {
      const isCurrentWorker = this.worker === w;
      if (isCurrentWorker) {
        this.worker = null;
        this.ready = null;
        this._readyResolved = false;
        this.busy = false;
        this.terminated = true;
      }
      if (this._readyReject) {
        const r = this._readyReject;
        this._readyReject = null;
        r(new Error(`file_parser_worker_exited_before_ready: code=${code}`));
      }
      if (isCurrentWorker && this._inflightReject) {
        const r = this._inflightReject;
        this._inflightReject = null;
        r(new Error(`file_parser_worker_exited: code=${code}`));
      }
      if (isCurrentWorker && this._releaseCurrent) {
        const r = this._releaseCurrent;
        this._releaseCurrent = null;
        r();
      }
      if (code !== 0) this.failedBoots++;
    });

    return this.ready;
  }

  tryClaim(): boolean {
    if (this.failedBoots > 3) return false;
    if (this.busy) return false;
    if (this.terminated) {
      this.terminated = false;
      this.failedBoots = 0;
      this.spawn().catch(() => {});
      return false;
    }
    if (!this.worker || !this._readyResolved) return false;

    this.busy = true;
    let resolveNextRelease!: () => void;
    this._claimChain = new Promise<void>((resolve) => {
      resolveNextRelease = resolve;
    });
    this._releaseCurrent = resolveNextRelease;
    return true;
  }

  async claim(): Promise<void> {
    while (true) {
      if (this.tryClaim()) return;
      if (!this.worker && !this.terminated) {
        try {
          await this.spawn();
        } catch {
          // Fall through to await chain
        }
      }
      await this._claimChain;
    }
  }

  release() {
    this.busy = false;
    this._inflightReject = null;
    if (this._releaseCurrent) {
      const r = this._releaseCurrent;
      this._releaseCurrent = null;
      r();
    }
  }

  async runOne(mimeType: string, filepath: string, timeoutMs: number): Promise<ExtractResult> {
    await this.claim();
    const id = crypto.randomUUID();
    const w = this.worker;

    if (!w) {
      this.release();
      throw parseError('PARSE_FAILED', 'worker_unavailable');
    }

    w.ref?.();
    return new Promise<ExtractResult>((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        settled = true;
        if (timer) clearTimeout(timer);
        w.off('message', onMessage);
        w.unref?.();
        this.release();
      };

      const onMessage = (msg: unknown) => {
        if (!msg || typeof msg !== 'object') return;
        const record = msg as {
          id?: string;
          ok?: boolean;
          payload?: ExtractResult;
          error?: { code?: string; message?: string };
        };
        if (record.id !== id) return;

        cleanup();
        if (record.ok && record.payload) {
          resolve(record.payload);
        } else {
          const code = (record.error?.code as ParseErrorCode) || 'PARSE_FAILED';
          const message = record.error?.message || 'file_parse_failed';
          reject(parseError(code, message));
        }
      };

      this._inflightReject = (err: unknown) => {
        if (settled) return;
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.terminate();
        this.release();
        reject(parseError('PARSE_TIMEOUT', `Extraction timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();

      w.on('message', onMessage);
      w.postMessage({ id, mimeType, filepath });
    });
  }

  terminate() {
    this.terminated = true;
    if (this.worker) {
      const old = this.worker;
      this.worker = null;
      old.terminate().catch(() => {});
    }
    this.busy = false;
    this.ready = null;
    this._readyResolved = false;
  }
}

export class FileParserPool {
  slots: WorkerSlot[];
  roundRobin: number;

  constructor(size = POOL_SIZE) {
    this.roundRobin = 0;
    this.slots = Array.from({ length: size }, (_, i) => new WorkerSlot(i, this));
  }

  async extract(
    mimeType: string,
    filepath: string,
    timeoutMs = PARSE_TIMEOUT_MS,
  ): Promise<ExtractResult> {
    if (process.env.FILE_PARSER_INLINE === 'true') {
      return await dispatchParser(mimeType, filepath);
    }

    // Pick slot via round-robin
    const slotIndex = this.roundRobin % this.slots.length;
    this.roundRobin = (this.roundRobin + 1) % this.slots.length;
    const slot = this.slots[slotIndex];

    try {
      return await slot.runOne(mimeType, filepath, timeoutMs);
    } catch (err: unknown) {
      // If worker spawning completely fails (e.g. system permissions), fallback to inline
      if (err instanceof Error && err.message.includes('file_parser_worker_entry_missing')) {
        return await dispatchParser(mimeType, filepath);
      }
      throw err;
    }
  }

  async stop(): Promise<void> {
    for (const slot of this.slots) {
      slot.terminate();
    }
  }
}

const defaultPool = new FileParserPool();

export async function extractInWorker(
  mimeType: string,
  filepath: string,
  timeoutMs = PARSE_TIMEOUT_MS,
): Promise<ExtractResult> {
  return await defaultPool.extract(mimeType, filepath, timeoutMs);
}

export async function stopFileParserPool(): Promise<void> {
  await defaultPool.stop();
}
