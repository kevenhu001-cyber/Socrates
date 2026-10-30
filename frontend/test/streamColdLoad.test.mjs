import assert from 'node:assert/strict';
import test from 'node:test';
import { callAPIStream } from '../src/chat/stream.ts';
import { turnState } from '../src/chat/turnState.ts';

function environment() {
  let requests = 0;
  turnState.activeChatAbort = null;
  globalThis.document = { cookie: '' };
  globalThis.window = {
    getActiveProvider: () => ({ isBuiltIn: false, name: 'test' }),
    addEventListener() {},
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
  assert.equal(typeof turnState.activeChatAbort, 'function');
  turnState.activeChatAbort('user-stop');
  assert.deepEqual(await stream, { text: '', cancelled: true });
  assert.equal(requests(), 0);
  assert.equal(turnState.activeChatAbort, null);
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
  turnState.activeChatAbort('superseded');
  const newer = () => {};
  turnState.activeChatAbort = newer;
  assert.equal((await stream).cancelled, true);
  assert.equal(requests(), 0);
  assert.equal(turnState.activeChatAbort, newer);
});
