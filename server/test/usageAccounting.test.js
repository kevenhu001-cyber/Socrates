// @ts-check
/**
 * usageAccounting — tests for real provider token accounting.
 *
 * Context: until 2026-09-25 every row in `usage_events` came from a chars/4
 * estimate. Two things caused that:
 *
 *   1. `stream_options: { include_usage: true }` was never sent, so a
 *      streaming response carried no `usage` object at all.
 *   2. Even if it had, the SSE parse loop in services/llm.ts began each frame
 *      with `if (!delta) continue`, and the usage frame is precisely the one
 *      frame with `choices: []` and no delta. It would have been discarded.
 *
 * (2) is the interesting regression to lock: it is invisible in any
 * integration test that only asserts on streamed content.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  IMAGE_TOKEN_ESTIMATE,
  estimateTokens,
  estimateMessageTokens,
  normalizeProviderUsage,
  resolveUsage,
} from '../src/services/usageTracker.js';
import { streamChatCompletion } from '../src/services/llm.js';

const BASE_OPTS = {
  apiBase: 'https://upstream.invalid/v1',
  apiKey: 'test-key',
  model: 'test-model',
  messages: [{ role: 'user', content: 'hi' }],
};

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** Serve a fixed list of SSE frames as a streaming response. */
function mockStream(frames, { capture } = {}) {
  globalThis.fetch = async (_url, init) => {
    if (capture) capture.body = JSON.parse(init.body);
    const body = frames.join('');
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
}

describe('normalizeProviderUsage: shapes', () => {
  test('OpenAI-compatible prompt_tokens / completion_tokens', () => {
    assert.deepEqual(
      normalizeProviderUsage({ prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 }),
      { promptTokens: 120, completionTokens: 45, totalTokens: 165 },
    );
  });

  test('Anthropic-style input_tokens / output_tokens', () => {
    assert.deepEqual(
      normalizeProviderUsage({ input_tokens: 10, output_tokens: 7 }),
      { promptTokens: 10, completionTokens: 7, totalTokens: 17 },
    );
  });

  test('Gemini-style promptTokenCount / candidatesTokenCount', () => {
    assert.deepEqual(
      normalizeProviderUsage({ promptTokenCount: 3, candidatesTokenCount: 4 }),
      { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
    );
  });

  test("a provider total larger than prompt+completion wins (cached / reasoning tokens are billed)", () => {
    const u = normalizeProviderUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 40 });
    assert.equal(u.totalTokens, 40);
  });

  test('a nonsensical smaller total is ignored rather than under-billing', () => {
    const u = normalizeProviderUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 2 });
    assert.equal(u.totalTokens, 15);
  });

  test('only one side reported still counts', () => {
    assert.deepEqual(
      normalizeProviderUsage({ completion_tokens: 9 }),
      { promptTokens: 0, completionTokens: 9, totalTokens: 9 },
    );
  });
});

describe('normalizeProviderUsage: hostile input degrades to null', () => {
  for (const [label, value] of [
    ['null', null],
    ['undefined', undefined],
    ['a string', 'usage'],
    ['a number', 42],
    ['an empty object', {}],
    ['unrelated keys', { foo: 1 }],
    ['NaN counts', { prompt_tokens: NaN, completion_tokens: NaN }],
    ['Infinity', { prompt_tokens: Infinity }],
    ['negative counts', { prompt_tokens: -5, completion_tokens: -1 }],
    ['string counts', { prompt_tokens: '100', completion_tokens: '20' }],
    ['all zeroes', { prompt_tokens: 0, completion_tokens: 0 }],
  ]) {
    test(label, () => {
      assert.equal(normalizeProviderUsage(value), null,
        'malformed upstream usage must fall back, never poison the billing table');
    });
  }

  test('fractional counts are rounded, not rejected', () => {
    assert.deepEqual(
      normalizeProviderUsage({ prompt_tokens: 10.4, completion_tokens: 0.6 }),
      { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
    );
  });
});

describe('resolveUsage: provenance', () => {
  test('provider numbers win and are tagged provider', () => {
    const r = resolveUsage({ prompt_tokens: 100, completion_tokens: 20 },
      { promptTokens: 999, completionTokens: 999 });
    assert.deepEqual(r, { promptTokens: 100, completionTokens: 20, usageSource: 'provider' });
  });

  test('absent usage falls back to the estimate and is tagged estimate', () => {
    const r = resolveUsage(null, { promptTokens: 7, completionTokens: 3 });
    assert.deepEqual(r, { promptTokens: 7, completionTokens: 3, usageSource: 'estimate' });
  });

  test('malformed usage falls back rather than recording zeroes', () => {
    const r = resolveUsage({ prompt_tokens: 'lots' }, { promptTokens: 7, completionTokens: 3 });
    assert.equal(r.usageSource, 'estimate');
    assert.equal(r.promptTokens, 7);
  });
});

describe('streamChatCompletion: asks for usage', () => {
  test('streaming requests set stream_options.include_usage', async () => {
    const capture = {};
    mockStream(['data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', 'data: [DONE]\n\n'], { capture });
    await streamChatCompletion({ ...BASE_OPTS }, () => {}, () => {}, () => {});
    assert.deepEqual(capture.body.stream_options, { include_usage: true },
      'without this the upstream never reports usage for a stream');
  });
});

describe('streamChatCompletion: the usage frame is no longer dropped', () => {
  test('usage arrives in a frame with choices: [] and reaches onDone', async () => {
    // This is the exact shape OpenAI emits with include_usage: a final frame
    // carrying no choices at all. The pre-2026-09-25 parse loop hit
    // `if (!delta) continue` and threw it away.
    mockStream([
      'data: {"choices":[{"delta":{"content":"he"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":2,"total_tokens":13}}\n\n',
      'data: [DONE]\n\n',
    ]);
    let text = '';
    let done = null;
    await streamChatCompletion({ ...BASE_OPTS }, (c) => { text += c; }, (info) => { done = info; }, () => {});
    assert.equal(text, 'hello');
    assert.ok(done, 'onDone must fire');
    assert.equal(done.finishReason, 'stop');
    const u = normalizeProviderUsage(done.usage);
    assert.ok(u, 'usage must survive the parse loop');
    assert.equal(u.promptTokens, 11);
    assert.equal(u.completionTokens, 2);
  });

  test('usage in the un-newline-terminated tail frame also survives', async () => {
    // Upstreams that close without a trailing blank line leave the last frame
    // in the buffer, handled by the tail-flush branch.
    mockStream([
      'data: {"choices":[{"delta":{"content":"x"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":1}}',
    ]);
    let done = null;
    await streamChatCompletion({ ...BASE_OPTS }, () => {}, (info) => { done = info; }, () => {});
    const u = normalizeProviderUsage(done.usage);
    assert.ok(u, 'tail-frame usage must survive');
    assert.equal(u.totalTokens, 6);
  });

  test('a finish_reason on a delta-less choice is still captured', async () => {
    mockStream([
      'data: {"choices":[{"delta":{"content":"y"}}]}\n\n',
      'data: {"choices":[{"index":0,"finish_reason":"length"}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    let done = null;
    await streamChatCompletion({ ...BASE_OPTS }, () => {}, (info) => { done = info; }, () => {});
    assert.equal(done.finishReason, 'length');
  });

  test('a stream with no usage frame reports none, so the caller estimates', async () => {
    mockStream(['data: {"choices":[{"delta":{"content":"z"}}]}\n\n', 'data: [DONE]\n\n']);
    let done = null;
    await streamChatCompletion({ ...BASE_OPTS }, () => {}, (info) => { done = info; }, () => {});
    assert.equal(normalizeProviderUsage(done.usage), null);
    assert.equal(resolveUsage(done.usage, { promptTokens: 1, completionTokens: 1 }).usageSource, 'estimate');
  });
});

describe('streamChatCompletion: stream_options compatibility fallback', () => {
  test('a gateway that 400s on stream_options is retried without it', async () => {
    const bodies = [];
    globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      if (bodies.length === 1) {
        return new Response('{"error":"unknown field stream_options"}', { status: 400 });
      }
      return new Response(new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n')); c.close(); },
      }), { status: 200 });
    };
    let text = '';
    await streamChatCompletion({ ...BASE_OPTS }, (c) => { text += c; }, () => {}, () => {});
    assert.equal(text, 'ok', 'the answer must still stream');
    assert.equal(bodies.length, 2, 'exactly one retry');
    assert.ok('stream_options' in bodies[0], 'first attempt asks for usage');
    assert.ok(!('stream_options' in bodies[1]), 'retry drops it');
    assert.deepEqual(bodies[1].messages, bodies[0].messages, 'retry keeps the conversation');
  });

  test('adding usage accounting did not add an upstream round-trip', async () => {
    // The invariant worth pinning: `stream_options` is dropped by the SAME
    // compatibility variant that was already dropping something else, not by
    // a variant of its own. Every extra variant is another request to the
    // provider on the 400 path, and llm.test.js pins those counts as a
    // contract. A tools request must still recover in exactly ONE retry.
    const bodies = [];
    globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      if (bodies.length === 1) return new Response('bad field', { status: 400 });
      return new Response(new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); c.close(); },
      }), { status: 200 });
    };
    const tools = [{ type: 'function', function: { name: 'f', parameters: {} } }];
    await streamChatCompletion({ ...BASE_OPTS, tools }, () => {}, () => {}, () => {});
    assert.equal(bodies.length, 2, 'exactly one retry, same as before usage accounting');
    assert.ok('stream_options' in bodies[0], 'first attempt asks for usage');
    assert.ok(!('stream_options' in bodies[1]), 'retry drops stream_options');
    assert.ok(!('tools' in bodies[1]), 'and drops tools in the same step, not a later one');
  });

  test('a plain stream still gets a recovery path of its own', async () => {
    // No tools, no priority, no reasoning fields: before usage accounting this
    // shape had NO fallback variant at all. It needs one now, otherwise a
    // gateway that rejects stream_options would fail the whole request.
    const bodies = [];
    globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      if (bodies.length === 1) return new Response('unknown field', { status: 400 });
      return new Response(new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n')); c.close(); },
      }), { status: 200 });
    };
    let text = '';
    await streamChatCompletion({ ...BASE_OPTS }, (c) => { text += c; }, () => {}, () => {});
    assert.equal(text, 'ok', 'the answer must still stream');
    assert.equal(bodies.length, 2);
    assert.ok(!('stream_options' in bodies[1]));
  });
});

describe('estimate fallback still behaves', () => {
  test('chars/4 with a floor of 1', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens('a'), 1);
    assert.equal(estimateTokens('a'.repeat(400)), 100);
  });

  test('image parts are counted, not silently free', () => {
    const tokens = estimateMessageTokens([
      { role: 'user', content: [{ type: 'image_url', image_url: { url: 'x' } }] },
    ]);
    assert.ok(tokens >= IMAGE_TOKEN_ESTIMATE);
  });
});
