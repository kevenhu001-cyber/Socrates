// @ts-check
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { streamChatCompletion, callChatCompletion } from '../src/services/core/llm.js';

const originalFetch = globalThis.fetch;
const opts = {
  apiBase: 'https://llm.example.test/v1', apiKey: 'test-only', model: 'test',
  messages: [{ role: 'user', content: 'hello' }],
};
const encode = (value) => new TextEncoder().encode(value);
const frame = (value) => `data: ${JSON.stringify(value)}\n\n`;
afterEach(() => { globalThis.fetch = originalFetch; });

function openBody(text, cancel) {
  return new ReadableStream({
    start(controller) { controller.enqueue(encode(text)); },
    cancel,
  });
}

async function collect(body) {
  globalThis.fetch = async () => new Response(body);
  const chunks = [], tools = [], done = [], errors = [];
  await streamChatCompletion(opts, (c) => chunks.push(c), (d) => done.push(d),
    (e) => errors.push(e), undefined, (tc) => tools.push(tc));
  return { chunks, tools, done, errors };
}

test('DONE completes an open provider body, preserves usage and ignores later tool calls', { timeout: 1000 }, async () => {
  let cancels = 0;
  const body = openBody(
    frame({ choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] })
    + frame({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 1 } })
    + 'data: [DONE]\r\n\r\n'
    + frame({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'late', function: { name: 'unsafe', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }),
    () => { cancels += 1; },
  );
  const result = await collect(body);
  assert.deepEqual(result.chunks, ['answer']);
  assert.deepEqual(result.done, [{ finishReason: 'stop', usage: { prompt_tokens: 3, completion_tokens: 1 } }]);
  assert.deepEqual(result.tools, []);
  assert.deepEqual(result.errors, []);
  assert.equal(cancels, 1);
  assert.equal(body.locked, false);
});

for (const text of [
  frame({ error: { message: 'provider failure' } }),
  '{"error":{"message":"provider failure"}}\n',
]) {
  test(`upstream error releases an open body: ${text.trim()}`, async () => {
    let cancels = 0;
    const body = openBody(text, () => { cancels += 1; });
    const result = await collect(body);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /provider failure/);
    assert.deepEqual(result.done, []);
    assert.equal(cancels, 1);
    assert.equal(body.locked, false);
  });
}

test('EOF releases the reader without requiring a DONE marker', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encode(frame({ choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] })));
      controller.close();
    },
  });
  const result = await collect(body);
  assert.deepEqual(result.chunks, ['answer']);
  assert.equal(result.done.length, 1);
  assert.deepEqual(result.errors, []);
  assert.equal(body.locked, false);
});

test('body read failure releases the lock and preserves the original error', async () => {
  const body = new ReadableStream({ start(controller) { controller.error(new Error('read failed')); } });
  const result = await collect(body);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /read failed/);
  assert.equal(body.locked, false);
});

test('cleanup rejection cannot replace a completed result', async () => {
  const body = openBody('data: [DONE]\n\n', () => { throw new Error('cancel failed'); });
  const result = await collect(body);
  assert.equal(result.done.length, 1);
  assert.deepEqual(result.errors, []);
  assert.equal(body.locked, false);
});

for (const mode of ['stream-network', 'stream-429', 'sync-network', 'sync-429']) {
  test(`${mode}: stopping cancels backoff, removes its timer and makes no further request`, { timeout: 1000 }, async () => {
    const ac = new AbortController();
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const armed = [], cleared = [];
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (mode.endsWith('network')) throw new TypeError('connection reset');
      return new Response('rate limited', { status: 429, headers: { 'retry-after': '30' } });
    };
    globalThis.setTimeout = (callback, delay, ...args) => {
      const timer = originalSetTimeout(callback, delay, ...args);
      armed.push(timer);
      queueMicrotask(() => ac.abort());
      return timer;
    };
    globalThis.clearTimeout = (timer) => {
      cleared.push(timer);
      return originalClearTimeout(timer);
    };
    try {
      if (mode.startsWith('stream')) {
        const done = [], errors = [];
        await streamChatCompletion({ ...opts, signal: ac.signal }, () => {},
          (d) => done.push(d), (e) => errors.push(e));
        assert.equal(done.length, 1);
        assert.deepEqual(errors, []);
      } else {
        await assert.rejects(callChatCompletion({ ...opts, signal: ac.signal }), { name: 'AbortError' });
      }
      assert.equal(calls, 1);
      assert.equal(armed.length, 1);
      assert.ok(cleared.includes(armed[0]), 'aborted backoff must clear its pending timer');
      assert.equal(getEventListeners(ac.signal, 'abort').length, 0);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
      for (const timer of armed) originalClearTimeout(timer);
    }
  });
}
