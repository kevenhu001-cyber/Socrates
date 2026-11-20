import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { Worker } from 'node:worker_threads';
import { shutdownPubsub } from '../src/lib/pubsub.js';
import {
  codeInterpreter,
  resolvePyodideWorkerEntry,
} from '../src/services/codeInterpreter/index.js';
import { PyodidePool } from '../src/services/codeInterpreter/pool.js';
import { runOnWorker } from '../src/services/codeInterpreter/workerRun.js';
import { createSessionExecutionLock } from '../src/services/sessionExecutionLock.js';
import { executeCodeInterpreter } from '../src/routes/chat/pipeline/executors/codeInterpreter.js';

after(() => shutdownPubsub());

test(
  'a cold Python worker runs standard-library code without fetching optional assets',
  {
    timeout: 15_000,
  },
  async (t) => {
    const networkRequests = [];
    const offline = `
    import { parentPort } from 'node:worker_threads';
    globalThis.fetch = async (url) => {
      parentPort.postMessage({ type: 'unexpected_fetch', url: String(url) });
      throw new Error('Offline test worker');
    };
  `;
    const entry = resolvePyodideWorkerEntry();
    const worker = new Worker(entry.file, {
      execArgv: [
        ...(entry.execArgv ?? []),
        '--import',
        `data:text/javascript,${encodeURIComponent(offline)}`,
      ],
    });
    t.after(() => worker.terminate());
    worker.on('message', (message) => {
      if (message.type === 'unexpected_fetch') networkRequests.push(message.url);
    });
    const scratchDir = await mkdtemp(join(tmpdir(), 'socrates-python-test-'));
    t.after(() => rm(scratchDir, { recursive: true, force: true }));
    const pool = new PyodidePool({ size: 1, spawnWorker: () => worker, bootTimeoutMs: 10_000 });
    const result = await runOnWorker(
      {
        executionId: 'offline',
        code: 'from math import comb\nprint(comb(8, 3))',
        scratchDir,
        timeoutMs: 5_000,
        waitSignal: AbortSignal.timeout(12_000),
      },
      pool,
    );
    assert.equal(result.status, 'completed', result.errorMessage);
    assert.match(result.stdout, /^56$/m);
    assert.deepEqual(networkRequests, []);
  },
);

test('successful Python executions stream no error code', async (t) => {
  t.mock.method(codeInterpreter, 'execute', async () => ({
    status: 'completed',
    stdout: '56\n',
    artifactFileIds: [],
  }));
  const events = [];
  await executeCodeInterpreter(
    { code: 'print(56)' },
    { id: 'calc' },
    {
      req: {},
      emitter: { event: (...args) => events.push(args) },
      toolPolicy: { recordResult() {} },
    },
  );
  assert.equal(events[0][0], 'tool_result');
  assert.equal(events[0][1].ok, true);
  assert.equal(events[0][1].errorCode, null);
  assert.equal(events[0][1].retryable, false);
});

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
