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
import path from 'node:path';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POOL_SIZE = Math.max(1, parseInt(process.env.CONTENT_EXTRACT_POOL_SIZE || '2', 10));
const EXTRACT_TIMEOUT_MS = Math.max(500, parseInt(process.env.CONTENT_EXTRACT_TIMEOUT_MS || '5000', 10));

class WorkerSlot {
  constructor({ index, pool }) {
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
      this.worker = null;
      this.busy = false;
      if (this._inflightReject) {
        const r = this._inflightReject;
        this._inflightReject = null;
        r(new Error('content_extractor_worker_exited: code=' + code));
      }
      if (code !== 0) this.failedBoots++;
      if (this._nextRelease) {
        const r = this._nextRelease;
        this._nextRelease = null;
        r();
      }
    });
    w.on('error', (err) => {
      if (this._inflightReject) {
        const r = this._inflightReject;
        this._inflightReject = null;
        r(err);
      }
    });
  }
  tryClaim() {
    if (this.failedBoots > 3) return false;
    if (this.busy || this.terminated || !this.worker) return false;
    this.busy = true;
    let resolveNext;
    this._claimChain = new Promise((resolve) => { resolveNext = resolve; });
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
    this.busy = false;
  }
  terminate() {
    this.terminated = true;
    this.busy = false;
    if (this.worker) {
      try { this.worker.terminate(); } catch {}
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
  }
}

class ExtractorPool {
  constructor({ size }) {
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
}

let pool = null;
function getPool() {
  if (!pool) {
    pool = new ExtractorPool({ size: POOL_SIZE });
    console.log(`[content-extractor] pool ready (${POOL_SIZE} workers, ${EXTRACT_TIMEOUT_MS}ms timeout)`);
  }
  return pool;
}

async function runOne(html, url) {
  const p = getPool();
  p._reapDeadSlots();
  const slot = await p.acquireSlot();
  const id = crypto.randomUUID();
  const worker = slot.worker;
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      worker.off('message', onMessage);
      slot.release();
      resolve(val);
    };
    const onMessage = (msg) => {
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
      slot.failedBoots++;
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
      worker.postMessage({ id, type: 'extract', html, url });
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
export async function extractArticle(html, url) {
  if (!html || !url) return null;
  try {
    return await runOne(html, url);
  } catch {
    return null;
  }
}

/* Internal: synchronous direct call (no worker). Useful as a fallback
   in tests where spawning a worker is overkill. NEVER call from a
   request hot-path — that's what `extractArticle` above is for. */
export function extractArticleSync(html, url) {
  let article = null;
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