/**
 * contentExtractor.js — public API for main-content extraction.
 *
 * Wraps the underlying JSDOM + Readability parse in a small
 * `worker_threads` pool so the CPU-bound parse can never block
 * the main Node event loop.
 *
 * Why a worker:
 *   - jsdom + @mozilla/readability are synchronous CPU work inside
 *     the JS engine. On 2026-07-04 one malformed marketing page
 *     pinned the main thread at 96.9% CPU for ~9 hours because the
 *     parse took longer than any watchdog.
 *   - Running in a worker means a stuck parse is bounded to one
 *     worker (which we can kill on timeout). The HTTP server stays
 *     responsive even if Readability wedges.
 *
 * Pool size:
 *   - 2 workers by default (HTML extraction is CPU-heavy; 2 lets us
 *     overlap with the fetch stage of the next URL).
 *   - Tunable via CONTENT_EXTRACT_POOL_SIZE.
 *
 * Timeout:
 *   - 5 s per extraction by default. JSDOM/Readability on the
 *     marketing-site URLs we tested complete in <500 ms; 5 s is a
 *     10× safety margin. On timeout we kill the worker, spawn a
 *     replacement, and return null so the caller falls back to raw
 *     HTML.
 *
 * Concurrency:
 *   - Each `extractArticle()` call is dispatched round-robin to an
 *     idle worker. If all workers are busy the call queues.
 *   - The worker is terminated + replaced if it crashes or times out.
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const POOL_SIZE = Math.max(1, parseInt(process.env.CONTENT_EXTRACT_POOL_SIZE || '2', 10));
const EXTRACT_TIMEOUT_MS = Math.max(500, parseInt(process.env.CONTENT_EXTRACT_TIMEOUT_MS || '5000', 10));

export interface ExtractedArticle {
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string;
  content: string;
  length: number;
  date: string | null;
  method: string;
  truncated?: boolean;
}

class WorkerSlot {
  index: number;
  pool: ExtractorPool;
  busy: boolean;
  terminated: boolean;
  worker: Worker | null;
  _nextRelease: (() => void) | null;
  _claimChain: Promise<void>;
  _inflightReject: ((err: Error) => void) | null;
  failedBoots: number;
  constructor({ index, pool }: { index: number; pool: ExtractorPool }) {
    this.index = index;
    this.pool = pool;
    this.busy = false;
    this.terminated = false;
    this.worker = null;
    this._nextRelease = null;
    this._claimChain = Promise.resolve();
    this._inflightReject = null;
    this.failedBoots = 0;
  }
  spawn() {
    const workerFile = path.join(__dirname, 'contentExtractorWorker.js');
    const w = new Worker(workerFile, {
      resourceLimits: {
        maxOldGenerationSizeMb: 512,
        maxYoungGenerationSizeMb: 64,
      },
    });
    this.worker = w;
    w.on('exit', (code) => {
      /* Capture-site guard: only touch slot state if THIS worker is
         still the active one. terminate() schedules the OLD worker's
         exit asynchronously; if _reapDeadSlots() has already swapped
         in a NEW worker (this.worker !== w), the OLD exit handler
         must NOT clobber busy/_nextRelease/_inflightReject — those
         belong to whatever runOne() is currently using the slot.

         Without this guard the exit handler can:
           1. set this.worker = null while a fresh worker is live →
              the next tryClaim returns false (worker missing) and
              the slot wedges forever.
           2. set busy=false while a NEW runOne is mid-flight →
              a third caller double-claims the slot and two runOnes
              race on the same worker.
           3. resolve _nextRelease / _inflightReject from a different
              call's closure → the active call's promise resolves
              with the wrong value and the next claimer wakes on a
              stale chain.

         Reproduces ~50% of the time on Node 20 (microtask timing
         between terminate() and _reapDeadSlots() differs from Node
         22), manifesting as fetchBatch.test.js ETIMEDOUT. */
      const isCurrentWorker = this.worker === w;
      if (isCurrentWorker) {
        this.worker = null;
        this.busy = false;
        // An unexpected worker exit must be reaped and replaced. Otherwise
        // the next queued caller can spin forever on a missing worker.
        this.terminated = true;
      }
      if (isCurrentWorker && this._inflightReject) {
        const r = this._inflightReject;
        this._inflightReject = null;
        r(new Error('content_extractor_worker_exited: code=' + code));
      }
      if (code !== 0) this.failedBoots++;
      if (isCurrentWorker && this._nextRelease) {
        const r = this._nextRelease;
        this._nextRelease = null;
        r();
      }
    });
    w.on('error', (err) => {
      // The old worker may emit its error after terminate() has already
      // installed a replacement in this slot. Never reject that new run.
      if (this.worker !== w) return;
      // Node emits `error` before `exit` for an uncaught worker failure.
      // Clear the slot synchronously so a caller awakened by the rejection
      // cannot re-spawn while the slot still looks busy and then get stuck
      // behind the old worker's later exit event.
      this.worker = null;
      this.busy = false;
      this.terminated = true;
      if (this._inflightReject) {
        const r = this._inflightReject;
        this._inflightReject = null;
        r(err);
      }
      if (this._nextRelease) {
        const r = this._nextRelease;
        this._nextRelease = null;
        r();
      }
    });
  }
  tryClaim() {
    if (this.failedBoots > 3) return false;
    if (this.busy || this.terminated || !this.worker) return false;
    this.busy = true;
    let resolveNext!: () => void;
    this._claimChain = new Promise<void>((resolve) => { resolveNext = resolve; });
    this._nextRelease = resolveNext;
    return true;
  }
  async claim() {
    while (true) {
      if (this.failedBoots > 3) {
        throw new Error('content_extractor_disabled: too many boot failures');
      }
      if (this.tryClaim()) return;
      // Busy — wait for the in-flight claim to release, then re-check.
      await this._claimChain;
    }
  }
  release() {
    // Make the slot observable as free before waking queued claimers.
    this.busy = false;
    if (this._nextRelease) {
      const r = this._nextRelease;
      this._nextRelease = null;
      r();
    }
    // Clear busy BEFORE resolving the chain so the next claim() that
    // wakes up sees this slot as free. Without this, the busy flag
    // stays set from the previous claim, and the next tryClaim() call
    // returns false even though the chain is resolved — spinning
    // forever. (Found this on 2026-07-04: 3rd concurrent extraction
    // hung because slot 0's release() never reset busy=true.)
  }
  terminate(): Promise<number> | null {
    this.terminated = true;
    this.busy = false;
    let termination: Promise<number> | null = null;
    if (this.worker) {
      try { termination = this.worker.terminate(); } catch {}
    }
    if (this._inflightReject) {
      const r = this._inflightReject;
      this._inflightReject = null;
      r(new Error('content_extractor_timeout'));
    }
    if (this._nextRelease) {
      const r = this._nextRelease;
      this._nextRelease = null;
      r();
    }
    return termination;
  }
}

class ExtractorPool {
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
    const slot = this.slots[startIdx];
    this._nextStart = (startIdx + 1) % this.slots.length;
    await slot.claim();
    return slot;
  }
  _reapDeadSlots() {
    for (const slot of this.slots) {
      if (slot.terminated && slot.failedBoots <= 3) {
        slot.terminated = false;
        slot.spawn();
      }
    }
  }
  async terminate() {
    await Promise.all(this.slots.map(async (slot) => {
      const termination = slot.terminate();
      if (termination) {
        try {
          await termination;
        } catch {}
      }
    }));
  }
}

let pool: ExtractorPool | null = null;
function getPool() {
  if (!pool) {
    pool = new ExtractorPool({ size: POOL_SIZE });
    console.log(`[content-extractor] pool ready (${POOL_SIZE} workers, ${EXTRACT_TIMEOUT_MS}ms timeout)`);
  }
  return pool;
}

async function runOne(html: string, url: string, maxChars?: number): Promise<ExtractedArticle | null> {
  const p = getPool();
  p._reapDeadSlots();
  const slot = await p.acquireSlot();
  const id = crypto.randomUUID();
  const worker = slot.worker!;
  return await new Promise<ExtractedArticle | null>((resolve) => {
    let settled = false;
    const finish = (val: ExtractedArticle | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      worker.off('message', onMessage);
      if (slot._inflightReject) slot._inflightReject = null;
      slot.release();
      resolve(val);
    };
    const onMessage = (msg: any) => {
      if (!msg || msg.id !== id) return;
      if (msg.type === 'result') {
        finish(msg.payload);
      } else if (msg.type === 'error') {
        finish(null);
      }
    };
    worker.on('message', onMessage);
    slot._inflightReject = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      worker.off('message', onMessage);
      slot.terminated = true;
      resolve(null);
    };
    const timeoutTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.off('message', onMessage);
      slot.terminate();
      resolve(null);
    }, EXTRACT_TIMEOUT_MS);
    try {
      worker.postMessage({ id, type: 'extract', html, url, maxChars });
    } catch (e) {
      finish(null);
    }
  });
}

/**
 * Run extraction. Returns null on timeout, parse failure, or if the
 * input HTML is too small to be useful. Safe to call from any code
 * path — never throws and never blocks the main event loop.
 */
export async function extractArticle(html: string, url: string, options: { maxChars?: number } = {}): Promise<ExtractedArticle | null> {
  if (!html || !url) return null;
  try {
    return await runOne(html, url, options.maxChars);
  } catch {
    return null;
  }
}

/**
 * Stops the lazily-created worker pool. Production keeps the pool alive for
 * process lifetime; tests and graceful shutdown paths can call this to prove
 * that no worker handles are leaked.
 */
export async function stopContentExtractorPool(): Promise<void> {
  const activePool = pool;
  pool = null;
  if (activePool) {
    await activePool.terminate();
  }
}

/* Internal: synchronous direct call (no worker). Useful as a fallback
   in tests where spawning a worker is overkill. NEVER call from a
   request hot-path — that's what `extractArticle` above is for. */
export function extractArticleSync(html: string, url: string) {
  let article: any = null;
  try {
    const { Readability } = require('@mozilla/readability');
    const { JSDOM, VirtualConsole } = require('jsdom');
    const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole(), runScripts: 'outside-only' });
    const doc = dom.window.document;
    article = new Readability(doc, { debug: false, charThreshold: 250 }).parse();
    if (article && article.textContent && article.textContent.trim().length >= 250) {
      return {
        title: (article.title || '').trim(),
        content: article.textContent.slice(0, 8000),
        length: Math.min(article.textContent.length, 8000),
        method: 'readability',
      };
    }
  } catch {}
  return null;
}
