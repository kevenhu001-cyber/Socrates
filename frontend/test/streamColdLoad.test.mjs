import assert from 'node:assert/strict';
import test from 'node:test';
import { callAPIStream } from '../src/chat/stream.ts';

function environment() {
  let requests = 0;
  globalThis.document = { cookie: '' };
  globalThis.window = {
    getActiveProvider: () => ({ isBuiltIn: false, name: 'test' }),
    offlineGuard: () => false,
    STREAM_MAX_ATTEMPTS: 1,
  };
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error('A cancelled cold stream must not issue a request');
  };
  return () => requests;
}

test('Stop during transport import cancels before any request and releases its abort handle', async () => {
  const requests = environment();
  const stream = callAPIStream([], 256, null, null, {});
  assert.equal(typeof window._activeChatAbort, 'function');
  window._activeChatAbort('user-stop');
  assert.deepEqual(await stream, { text: '', cancelled: true });
  assert.equal(requests(), 0);
  assert.equal(window._activeChatAbort, null);
});

test('session AbortSignal during transport import cannot send a stale request', async () => {
  const requests = environment();
  const controller = new AbortController();
  const stream = callAPIStream([], 256, null, null, { signal: controller.signal });
  controller.abort('session-switch');
  assert.equal((await stream).cancelled, true);
  assert.equal(requests(), 0);
});

test('cancelled import cleanup preserves a newer turn abort handle', async () => {
  const requests = environment();
  const stream = callAPIStream([], 256, null, null, {});
  window._activeChatAbort('superseded');
  const newer = () => {};
  window._activeChatAbort = newer;
  assert.equal((await stream).cancelled, true);
  assert.equal(requests(), 0);
  assert.equal(window._activeChatAbort, newer);
});
