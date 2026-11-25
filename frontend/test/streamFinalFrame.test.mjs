import test from 'node:test';
import { installTestProvider } from './providerFixture.mjs';
test.beforeEach(installTestProvider);
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
    addEventListener() {},
    isReasoningProvider: () => false,
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

  const { callAPIStream } = await import('../src/chat/stream.ts');
  let full = '';
  const result = await callAPIStream(
    [{ role: 'user', content: 'hi' }],
    256,
    (_delta, acc) => {
      full = acc;
    },
    null,
    { maxAttempts: 1 },
  );

  assert.ok(result, 'stream should resolve to a result');
  assert.equal(result.cancelled, false);
  assert.equal(result.text, 'Hello world GOODBYE');
  assert.equal(full, 'Hello world GOODBYE');
});

test(
  'DONE settles the answer even if the server keeps the response open',
  { timeout: 2000 },
  async () => {
    installEnvironment([]);
    let cancelled = false;
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"Complete answer."}}]}\n\ndata: [DONE]\n\n',
              ),
            );
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    const { callAPIStream } = await import('../src/chat/stream.ts');
    const result = await callAPIStream([{ role: 'user', content: 'hi' }], 256, null, null, {
      maxAttempts: 1,
    });
    assert.equal(result.text, 'Complete answer.');
    assert.equal(cancelled, true);
  },
);

test('clean EOF on a bound stream recovers the missing answer instead of finalizing its prefix', async () => {
  installEnvironment([]);
  globalThis.fetch = async (url) => {
    if (String(url).includes('/chat-turns/')) {
      return Response.json({ turn: { status: 'completed', fullText: 'A complete answer.' } });
    }
    return new Response(
      'event: turn_bound\ndata: {"turnId":"bound-1"}\n\n' +
        'data: {"choices":[{"delta":{"content":"A complete"}}]}\n\n',
    );
  };
  const { callAPIStream } = await import('../src/chat/stream.ts');
  const result = await callAPIStream([{ role: 'user', content: 'hi' }], 256, null, null, {
    maxAttempts: 1,
  });
  assert.equal(result.text, 'A complete answer.');
});

test('a reasoning-only response never reports success', async () => {
  installEnvironment([
    'data: {"choices":[{"delta":{"reasoning_content":"Internal text"}}]}\n\n',
    'data: [DONE]\n\n',
  ]);
  const { callAPIStream } = await import('../src/chat/stream.ts');
  const result = await callAPIStream([{ role: 'user', content: 'hi' }], 256, null, null, {
    maxAttempts: 1,
  });
  assert.equal(result, null);
});
