import { Worker } from 'node:worker_threads';
import path from 'node:path';
import crypto from 'node:crypto';

const __dirname = '/home/ubuntu/User/Socrates/server/dist/services';

class WorkerSlot {
  index;
  busy = false;
  terminated = false;
  worker = null;
  failedBoots = 0;
  _nextRelease = null;
  _claimChain = Promise.resolve();
  _inflightReject = null;
  constructor({ index }) { this.index = index; this.spawn(); }
  spawn() {
    const workerFile = path.join(__dirname, 'contentExtractorWorker.js');
    const w = new Worker(workerFile, {});
    this.worker = w;
    w.on('exit', (code) => {
      console.log(`[slot${this.index}] exit code=${code} busy=${this.busy} _nextRelease=${!!this._nextRelease}`);
      this.worker = null;
      this.busy = false;
      if (this._inflightReject) { const r = this._inflightReject; this._inflightReject = null; r(new Error('exit')); }
      if (code !== 0) this.failedBoots++;
      if (this._nextRelease) { const r = this._nextRelease; this._nextRelease = null; r(); }
    });
  }
  tryClaim() {
    if (this.busy || this.terminated || !this.worker) return false;
    this.busy = true;
    let resolveNext;
    this._claimChain = new Promise((resolve) => { resolveNext = resolve; });
    this._nextRelease = resolveNext;
    return true;
  }
  async claim() {
    while (true) {
      if (this.tryClaim()) return;
      await this._claimChain;
    }
  }
  release() {
    if (this._nextRelease) { const r = this._nextRelease; this._nextRelease = null; r(); }
    this.busy = false;
  }
}

class Pool {
  slots;
  _nextStart = 0;
  constructor({ size }) { this.slots = Array.from({ length: size }, (_, i) => new WorkerSlot({ index: i })); }
  async acquireSlot() {
    const startIdx = this._nextStart;
    for (let i = 0; i < this.slots.length; i++) {
      const idx = (startIdx + i) % this.slots.length;
      const slot = this.slots[idx];
      if (slot.tryClaim()) { this._nextStart = (idx + 1) % this.slots.length; return slot; }
    }
    const slot = this.slots[startIdx];
    this._nextStart = (startIdx + 1) % this.slots.length;
    await slot.claim();
    return slot;
  }
}

const pool = new Pool({ size: 2 });

async function extract(html, url, label) {
  const t = Date.now();
  const slot = await pool.acquireSlot();
  console.log(`[${label}] claimed slot${slot.index} after ${Date.now()-t}ms busy=${slot.busy}`);
  const id = crypto.randomUUID();
  const worker = slot.worker;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      worker.off('message', onMessage);
      slot.release();
      console.log(`[${label}] finished after ${Date.now()-t}ms; slot${slot.index} busy now=${slot.busy}`);
      resolve(v);
    };
    const onMessage = (msg) => {
      if (!msg || msg.id !== id) return;
      if (msg.type === 'result') finish(msg.payload);
      else if (msg.type === 'error') finish(null);
    };
    worker.on('message', onMessage);
    worker.postMessage({ id, type: 'extract', html, url });
  });
}

(async () => {
  const html = '<html><body>' + 'x'.repeat(300) + '</body></html>';
  const t = Date.now();
  console.log('=== call 1 ===');
  await extract(html, 'http://a.test/1', 'c1');
  console.log('=== call 2 ===');
  await extract(html, 'http://a.test/2', 'c2');
  console.log('=== call 3 ===');
  await extract(html, 'http://a.test/3', 'c3');
  console.log('=== call 4 ===');
  await extract(html, 'http://a.test/4', 'c4');
  console.log('all done', Date.now()-t);
  process.exit(0);
})();