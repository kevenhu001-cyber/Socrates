// @ts-check
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Mock only the worker boundary in a subprocess: a broken acquisition loop
// starves timers, so the parent must enforce the regression's hard deadline.
for (const failure of ['timeout', 'exit', 'error']) {
  test(`queued extraction recovers after worker ${failure}`, () => {
    const source = `
      import assert from 'node:assert/strict';
      import { EventEmitter } from 'node:events';
      import { mock } from 'node:test';
      let spawned = 0;
      class FakeWorker extends EventEmitter {
        constructor() { super(); this.number = ++spawned; }
        postMessage({ id }) {
          if (this.number === 1) {
            if (${JSON.stringify(failure)} === 'exit') setImmediate(() => this.emit('exit', 1));
            if (${JSON.stringify(failure)} === 'error') setImmediate(() => {
              this.emit('error', new Error('fixture boot failure'));
              setImmediate(() => this.emit('exit', 1));
            });
            return;
          }
          setImmediate(() => this.emit('message', {
            id, type: 'result', payload: { title: 'replacement', content: 'recovered' },
          }));
        }
        terminate() {
          return new Promise(resolve => setImmediate(() => { this.emit('exit', 1); resolve(1); }));
        }
      }
      mock.module('node:worker_threads', { namedExports: { Worker: FakeWorker } });
      const { extractArticle, stopContentExtractorPool } = await import('./src/services/embeddings/contentExtractor.ts');
      try {
        const [first, queued] = await Promise.all([
          extractArticle('<p>first</p>', 'https://first.test'),
          extractArticle('<p>queued</p>', 'https://queued.test'),
        ]);
        assert.equal(first, null, 'the failed extraction falls back');
        assert.equal(queued?.content, 'recovered', 'the queued extraction uses a replacement worker');
        assert.equal(spawned, 2, 'only the dead worker is replaced');
      } finally {
        await stopContentExtractorPool();
      }
    `;
    const result = spawnSync(process.execPath, [
      '--experimental-test-module-mocks', '--import', 'tsx', '--input-type=module', '-e', source,
    ], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      env: { ...process.env, CONTENT_EXTRACT_POOL_SIZE: '1', CONTENT_EXTRACT_TIMEOUT_MS: '500' },
      timeout: 10_000,
      killSignal: 'SIGKILL',
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
