import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import test from 'node:test';

test('Python worker execution and streamed diagnostics', { timeout: 60_000 }, async (t) => {
  const scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'socrates-worker-test-'));
  const source = new URL('../src/services/pyodideWorker.ts', import.meta.url);
  // Core Python ships in the npm package. Optional wheels/fonts must not
  // make this regression suite depend on network access or a warm cache.
  const worker = new Worker(source, {
    execArgv: ['--import', 'tsx', '--import', 'data:text/javascript,' + encodeURIComponent(
      'globalThis.fetch = async () => { throw new Error("network disabled in worker test"); };',
    )],
    env: { ...process.env, EXEC_CJK_FONT_DIR: path.join(scratchDir, 'fonts') },
  });
  t.after(async () => {
    await worker.terminate();
    await fs.rm(scratchDir, { recursive: true, force: true });
  });
  const [boot] = await once(worker, 'message');
  assert.equal(boot.type, 'ready', boot.error);

  let nextId = 0;
  async function run(code) {
    assert.notEqual(worker.threadId, -1, 'Python worker must survive previous executions');
    const id = String(++nextId);
    const progress = [];
    const result = await new Promise((resolve, reject) => {
      const onError = (error) => { cleanup(); reject(error); };
      const onMessage = (message) => {
        if (message.id !== id) return;
        if (message.type === 'result') {
          cleanup();
          resolve(message);
        } else {
          progress.push(message);
        }
      };
      const cleanup = () => {
        worker.off('message', onMessage);
        worker.off('error', onError);
      };
      worker.on('message', onMessage);
      worker.once('error', onError);
      worker.postMessage({ id, type: 'run', code, scratchDir, maxOutputBytes: 65536 });
    });
    return { ...result, progress };
  }

  await t.test('live output contains Python text, not stream labels, across reused runs', async () => {
    for (const value of ['first output', 'second output']) {
      const result = await run(`import sys\nprint(${JSON.stringify(value)})\nprint('diagnostic', file=sys.stderr)`);
      assert.equal(result.status, 'completed');
      assert.match(result.stdout, new RegExp(value));
      assert.equal(result.stderr, 'diagnostic\n');
      assert.equal(result.progress.filter(e => e.type === 'stdout').map(e => e.chunk).join(''), result.stdout);
      assert.equal(result.progress.filter(e => e.type === 'stderr').map(e => e.chunk).join(''), result.stderr);
    }
  });

  await t.test('module-level future imports remain valid and tracebacks use original source lines', async () => {
    const result = await run('from __future__ import annotations\nprint("future import works")\nraise ValueError("bad input")');
    assert.equal(result.status, 'failed');
    assert.equal(result.errorMessage, 'ValueError: bad input');
    assert.match(result.stdout, /future import works/);
    assert.match(result.stderr, /File "<socrates>", line 3/);
    assert.match(result.stderr, /raise ValueError\("bad input"\)/);
  });

  await t.test('nonzero sys.exit is a failure, not a successful execution', async () => {
    const result = await run('import sys\nsys.exit(7)');
    assert.equal(result.status, 'failed');
    assert.equal(result.exitCode, 7);
  });

  await t.test('clean exits and string exit messages retain Python semantics', async () => {
    for (const statement of ['sys.exit()', 'sys.exit(0)', 'sys.exit(False)']) {
      const result = await run(`import sys\nprint('before exit')\n${statement}\nprint('unreachable')`);
      assert.equal(result.status, 'completed');
      assert.equal(result.exitCode, 0);
      assert.match(result.stdout, /before exit/);
      assert.doesNotMatch(result.stdout, /unreachable/);
    }
    const result = await run('import sys\nsys.exit("cannot continue")');
    assert.equal(result.status, 'failed');
    assert.equal(result.exitCode, 1);
    assert.equal(result.stderr, 'cannot continue\n');
  });

  await t.test('syntax errors retain source positions and do not poison the next execution', async () => {
    const failure = await run('answer = 1\nif True\n    print(answer)');
    assert.equal(failure.status, 'failed');
    assert.equal(failure.errorCode, 'syntax_error');
    assert.match(failure.stderr, /line 2/);
    const success = await run('print("worker recovered")');
    assert.equal(success.status, 'completed');
    assert.match(success.stdout, /worker recovered/);
    assert.equal(success.stderr, '');
  });
});
