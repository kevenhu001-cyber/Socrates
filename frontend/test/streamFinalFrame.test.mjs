import test from 'node:test';
import assert from 'node:assert/strict';

/* P_final_frame_flush regression — an upstream that closes the SSE
   connection without a trailing "\n\n" used to leave its last frame
   unparsed, dropping the final content delta ("occasional last few
   chars truncated"). Drive callAPIStream with a reader whose final
   frame has no terminator and assert the tail survives.

   We mock the global `fetch` (which apiFetchRaw wraps) rather than the
   module itself, so the test needs no experimental module-mock flag and
   runs under the plain `node --test` invocation CI uses. */

const encoder = new TextEncoder();

function makeReader(chunks) {
  let i = 0;
  return {
    getReader() {
      return {
        async read() {
          if (i < chunks.length) {
            return { value: encoder.encode(chunks[i++]), done: false };
          }
          return { value: undefined, done: true };
        },
        cancel() {},
        releaseLock() {},
      };
    },
  };
}

function installEnvironment(chunks) {
  const state = { lastCallError: null };
  globalThis.document = { cookie: '' };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    body: makeReader(chunks),
  });
  globalThis.window = {
    state,
    getActiveProvider: () => ({ isBuiltIn: false, name: 'test' }),
    getCsrfToken: () => null,
    makeAIWatchdog: () => ({ touch() {}, clear() {} }),
    sleepBackoff: async () => {},
    offlineGuard: () => false,
    isReasoningProvider: () => false,
    STREAM_TIMEOUT_MS: 240000,
    STREAM_HEARTBEAT_MS: 45000,
    STREAM_RETRYABLE_STATUS: {},
    STREAM_MAX_ATTEMPTS: 1,
    appMode: 'chat',
  };
  return state;
}

test('final SSE frame without trailing newline is still parsed', async () => {
  installEnvironment([
    'data: {"choices":[{"delta":{"content":"Hello world"}}]}\n\n',
    /* No trailing "\n\n" — mimics an upstream closing mid-frame. */
    'data: {"choices":[{"delta":{"content":" GOODBYE"}}]}',
  ]);

  const { callAPIStream } = await import('../src/chat/stream.js');
  let full = '';
  const result = await callAPIStream(
    [{ role: 'user', content: 'hi' }],
    256,
    (_delta, acc) => { full = acc; },
    null,
    {},
  );

  assert.ok(result, 'stream should resolve to a result');
  assert.equal(result.cancelled, false);
  assert.equal(result.text, 'Hello world GOODBYE');
  assert.equal(full, 'Hello world GOODBYE');
});
