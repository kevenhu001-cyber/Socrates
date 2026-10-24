import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createUpstreamRetryBudget, UPSTREAM_RETRY_BUDGET_MS } from '../src/lib/upstreamRetryBudget.ts';
import { streamChatCompletion, callChatCompletion, getLlmDispatcher } from '../src/services/core/llm.ts';
import { buildSseErrorFrame } from '../src/lib/sseErrorFrame.ts';
import { errorHandler } from '../src/middleware/error.ts';

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
afterEach(() => { globalThis.fetch = originalFetch; globalThis.setTimeout = originalSetTimeout; });
after(async () => { await getLlmDispatcher().close(); });
const opts = { apiBase: 'https://test.invalid/v1', apiKey: 'test', model: 'test', messages: [{ role: 'user', content: 'hello' }] };

async function failure(stream) {
  if (!stream) {
    try { await callChatCompletion(opts); } catch (error) { return error; }
  } else {
    let error;
    await streamChatCompletion(opts, () => {}, () => {}, (err) => { error = err; });
    return error;
  }
  assert.fail('expected provider failure');
}

test('all retries share an eight-second wait budget', () => {
  const budget = createUpstreamRetryBudget(() => 0);
  assert.equal(UPSTREAM_RETRY_BUDGET_MS, 8000);
  assert.equal(budget.reserve(2000), true);
  assert.equal(budget.reserve(4000), true);
  assert.equal(budget.reserve(8000), false);
  assert.equal(budget.reserve(2000), true);
  assert.equal(budget.reserve(1), false);
});

test('response time consumes the budget, and longer Retry-After is never shortened', () => {
  let now = 0;
  const budget = createUpstreamRetryBudget(() => now);
  assert.equal(budget.reserve(2000), true);
  now = 7500;
  assert.equal(budget.reserve(501), false);
  assert.equal(budget.reserve(500), true);
  for (const invalid of [-1, NaN, Infinity]) assert.equal(budget.reserve(invalid), false);
  assert.equal(createUpstreamRetryBudget().reserve(60_000), false);
});

for (const stream of [true, false]) {
  test(`${stream ? 'stream' : 'completion'}: long cooldown returns immediately with metadata and no browser replay`, async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response('private provider response', { status: 429, headers: { 'Retry-After': '60' } });
    };
    const error = await failure(stream);
    assert.equal(calls, 1);
    const frame = buildSseErrorFrame(error);
    assert.equal(frame.retryable, false);
    assert.equal(frame.retryAfterMs, 60_000);
    assert.equal(frame.upstreamStatus, 429);
    assert.doesNotMatch(frame.message, /private provider/);
  });

  test(`${stream ? 'stream' : 'completion'}: fallback backoff cannot spend more than eight seconds`, async () => {
    let calls = 0;
    const waits = [];
    globalThis.fetch = async () => { calls++; return new Response('busy', { status: 429 }); };
    globalThis.setTimeout = (cb, ms, ...args) => {
      waits.push(ms);
      return originalSetTimeout(cb, 0, ...args);
    };
    const error = await failure(stream);
    assert.equal(calls, 3, '2s + 4s fit, the next 8s wait does not');
    assert.equal(waits.length, 2);
    assert.ok(waits.reduce((sum, ms) => sum + ms, 0) <= 8000);
    assert.equal(error.retryable, false);
  });

  test(`${stream ? 'stream' : 'completion'}: permanent quota is terminal without a misleading cooldown`, async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('insufficient_quota', { status: 429 }); };
    const frame = buildSseErrorFrame(await failure(stream));
    assert.equal(calls, 1);
    assert.equal(frame.retryable, false);
    assert.equal(frame.retryAfterMs, undefined);
  });

  test(`${stream ? 'stream' : 'completion'}: exhausted transport retries cannot restart in the browser`, async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new TypeError('connection reset'); };
    globalThis.setTimeout = (cb, _ms, ...args) => originalSetTimeout(cb, 0, ...args);
    const error = await failure(stream);
    assert.equal(calls, 3);
    assert.equal(buildSseErrorFrame(error).retryable, false);
    let body;
    const response = { setHeader() {}, status() { return this; }, json(value) { body = value; } };
    errorHandler(error, { headers: {} }, response, () => {});
    assert.equal(body.retryable, false);
  });

  for (const status of [400, 401, 404, 422]) {
    test(`${stream ? 'stream' : 'completion'}: deterministic ${status} never retries`, async () => {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return new Response('invalid request', { status }); };
      const error = await failure(stream);
      assert.equal(calls, 1);
      assert.equal(error.status, status);
      assert.equal(error.retryable, false);
    });
  }
}
