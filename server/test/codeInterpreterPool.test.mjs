import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import test, { after } from 'node:test';
import { shutdownPubsub } from '../src/lib/pubsub.js';
import { PyodidePool } from '../src/services/codeInterpreter/pool.js';
import { runOnWorker } from '../src/services/codeInterpreter/workerRun.js';
import { createSessionExecutionLock } from '../src/services/sessionExecutionLock.js';

after(() => shutdownPubsub());

class WorkerFixture extends EventEmitter {
  messages = [];
  termination = undefined;

  constructor(boot = 'ready') {
    super();
    if (boot) queueMicrotask(() => this.emit('message', { id: 'boot', type: boot }));
  }

  postMessage(message) {
    this.messages.push(message);
    this.emit('request', message);
    if (message.code === 'complete')
      queueMicrotask(() => {
        this.emit('message', {
          id: message.id,
          type: 'result',
          status: 'completed',
          stdout: 'ok',
          durationMs: 4,
          packageMs: 2,
        });
      });
  }

  terminate() {
    this.termination ??= new Promise((resolve) => {
      setImmediate(() => {
        this.emit('exit', 1);
        resolve(1);
      });
    });
    return this.termination;
  }
}

const job = (options = {}) => ({
  executionId: 'fixture',
  code: 'complete',
  scratchDir: '/unused',
  ...options,
});

function fixturePool(options = {}) {
  const workers = [];
  const pool = new PyodidePool({
    size: 1,
    bootTimeoutMs: 500,
    spawnWorker: () => {
      const worker = new WorkerFixture(workers.length === 0 ? options.firstBoot : 'ready');
      workers.push(worker);
      return worker;
    },
  });
  return { pool, workers };
}

test('expired worker wait never posts queued code or consumes the next lease', async () => {
  const { pool, workers } = fixturePool();
  const held = await pool.acquireSlot();
  const controller = new AbortController();
  const waiting = runOnWorker(job({ waitSignal: controller.signal }), pool);
  controller.abort();
  await assert.rejects(waiting, { code: 'execution_queue_timeout' });
  assert.equal(workers[0].messages.length, 0);
  held.release();
  const next = await runOnWorker(job(), pool);
  assert.equal(next.status, 'completed');
  assert.equal(next.packageMs, 2);
  assert.equal(typeof next.queueMs, 'number');
  assert.equal(workers[0].messages.length, 1);
});

test(
  'cancelling a running task reclaims an unresponsive worker before the next task',
  { timeout: 5_000 },
  async () => {
    const { pool, workers } = fixturePool();
    const controller = new AbortController();
    const started = once(workers[0], 'request');
    const first = runOnWorker(job({ code: 'no-reply', signal: controller.signal }), pool);
    const [request] = await started;
    const next = runOnWorker(job(), pool);
    controller.abort();
    assert.equal(Atomics.load(new Uint8Array(request.interruptBuffer), 0), 2);
    await assert.rejects(first, { code: 'execution_cancelled', status: 'cancelled' });
    assert.equal((await next).stdout, 'ok');
    assert.equal(workers.length, 2);
    assert.equal(workers[0].messages.length, 1);
    assert.equal(workers[0].listenerCount('message'), 0);
    assert.equal(workers[1].messages.length, 1);
  },
);

test(
  'run deadline classifies a hard termination as a timeout and the next run recovers',
  { timeout: 5_000 },
  async () => {
    const { pool, workers } = fixturePool();
    await assert.rejects(runOnWorker(job({ code: 'no-reply', timeoutMs: 100 }), pool), {
      code: 'execution_timeout',
      status: 'timeout',
    });
    assert.equal((await runOnWorker(job(), pool)).status, 'completed');
    assert.equal(workers.length, 2);
  },
);

test('a queued execution takes the first available worker', async () => {
  const pool = new PyodidePool({ size: 2, spawnWorker: () => new WorkerFixture() });
  const first = await pool.acquireSlot();
  const second = await pool.acquireSlot();
  const queued = pool.acquireSlot();
  second.release();
  const claimed = await queued;
  assert.equal(claimed, second);
  claimed.release();
  first.release();
});

test('worker boot failure is retired and a new slot generation can run', async () => {
  const { pool, workers } = fixturePool({ firstBoot: 'error' });
  await assert.rejects(runOnWorker(job(), pool), { code: 'pyodide_worker_boot_failed' });
  assert.equal((await runOnWorker(job(), pool)).status, 'completed');
  assert.equal(workers.length, 2);
});

test('a silent boot is bounded and the next claimant can recover', async () => {
  const { pool, workers } = fixturePool({ firstBoot: null });
  // The fake worker itself does not hold the event loop open.
  const keepalive = setTimeout(() => undefined, 2000);
  try {
    await assert.rejects(runOnWorker(job(), pool), {
      code: 'pyodide_worker_boot_failed',
      message: 'pyodide_worker_boot_timeout',
    });
    assert.equal((await runOnWorker(job(), pool)).status, 'completed');
    assert.equal(workers.length, 2);
  } finally {
    clearTimeout(keepalive);
  }
});

test('a cancelled session waiter cannot open the lock ahead of the active writer', async () => {
  const lock = createSessionExecutionLock();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const first = lock.run('s', () => gate);
  const controller = new AbortController();
  const skipped = lock.run('s', () => assert.fail('cancelled callback ran'), controller.signal);
  controller.abort(new Error('cancelled'));
  await assert.rejects(skipped, /cancelled/);
  let started = false;
  const last = lock.run('s', async () => {
    started = true;
  });
  await Promise.resolve();
  assert.equal(started, false);
  release();
  await Promise.all([first, last]);
  assert.equal(started, true);
  assert.equal(lock.pendingSessions, 0);
});
