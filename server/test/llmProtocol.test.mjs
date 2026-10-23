import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { streamChatCompletion, callChatCompletion, upstreamRetryDelayMs, LlmProviderError } from '../src/services/core/llm.js';
import { permitsCompatibilityFallback, isPermanentQuotaError } from '../src/services/core/llmProtocol.js';
import { SseEmitter } from '../src/routes/chat/pipeline/sseEmitter.js';
import { makeStreamError } from '../../frontend/src/chat/streamFrameProcessor.ts';
import { isRetryableAIError } from '../../frontend/src/chat/retryPolicy.ts';

const fetchBefore = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchBefore; });
const opts = { apiBase: 'https://api.minimax.io/v1', apiKey: 'test-secret', model: 'MiniMax-M3.1-Flash', messages: [{ role: 'user', content: 'hello' }] };
const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));

test('M3.1 uses documented adaptive/effort/token fields, without unsupported priority', async () => {
  let body, headers;
  globalThis.fetch = async (_url, init) => { body = JSON.parse(init.body); headers = init.headers; return ok(); };
  const response = await callChatCompletion({ ...opts, maxTokens: 1234, response_speed: 'fast' });
  assert.equal(body.thinking.type, 'adaptive');
  assert.equal(body.reasoning_effort, 'medium');
  assert.equal(body.reasoning_split, true);
  assert.equal(body.max_completion_tokens, 1234);
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.service_tier, undefined);
  assert.equal(headers.Authorization, 'Bearer test-secret');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers.Accept, 'application/json');
  assert.equal(response.meta.response_speed_applied, 'standard');
});

test('unsupported Instant is rejected locally, without even one upstream call', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return ok(); };
  await assert.rejects(() => callChatCompletion({ ...opts, reasoning_effort: 'none' }), { status: 400, code: 'MODEL_MODE_UNSUPPORTED' });
  let error;
  await streamChatCompletion({ ...opts, extra_body: { thinking: { type: 'disabled' } } }, () => {}, () => {}, (e) => { error = e; });
  assert.equal(error.code, 'MODEL_MODE_UNSUPPORTED');
  assert.equal(calls, 0);
});

test('DeepSeek sends stable opaque user_id only to its official host and preserves reasoning', async () => {
  const bodies = [];
  globalThis.fetch = async (_url, init) => { bodies.push(JSON.parse(init.body)); return ok(); };
  const messages = [{ role: 'assistant', content: 'answer', reasoning_content: 'reasoning' }, { role: 'user', content: 'next' }];
  const input = { ...opts, model: 'deepseek-flash', apiBase: 'https://api.deepseek.com/v1', userId: 'private-account@example.test', messages };
  await callChatCompletion(input);
  await callChatCompletion(input);
  await callChatCompletion({ ...input, userId: 'another-user' });
  await callChatCompletion({ ...input, apiBase: 'https://gateway.example.test/v1' });
  assert.match(bodies[0].user_id, /^socrates_[a-f0-9]{32}$/);
  assert.equal(bodies[0].user_id, bodies[1].user_id);
  assert.notEqual(bodies[0].user_id, bodies[2].user_id);
  assert.equal(bodies[3].user_id, undefined);
  assert.equal(bodies[0].messages[0].reasoning_content, 'reasoning');
  assert.equal(bodies[0].messages[0].reasoning_details, undefined);
});

test('deterministic 400s do not strip tools or retry', async () => {
  for (const message of ['model requires adaptive thinking', 'context length exceeded', 'reasoning_content required', 'invalid messages']) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ error: { message } }), { status: 400 }); };
    let error;
    await streamChatCompletion({ ...opts, response_speed: 'fast', tools: [{ type: 'function', function: { name: 'test' } }] }, () => {}, () => {}, (e) => { error = e; });
    assert.equal(error.status, 400);
    assert.equal(calls, 1);
  }
  assert.equal(permitsCompatibilityFallback('tools unsupported', 'provider-400-with-tools'), true);
  assert.equal(permitsCompatibilityFallback('context length exceeded', 'provider-400-with-tools'), false);
  assert.equal(permitsCompatibilityFallback('unknown field model', 'provider-400-with-optional-fields'), false);
});

test('diagnosed fallback order preserves tools and never reintroduces rejected fields', async () => {
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    const field = ['stream_options', 'service_tier', 'reasoning_effort'][bodies.length - 1];
    return field ? new Response(`unknown field ${field}`, { status: 400 })
      : new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n');
  };
  let text = '';
  await streamChatCompletion({ ...opts, model: 'gpt-4o', response_speed: 'fast', reasoning_effort: 'high', tools: [{ type: 'function', function: { name: 'test', parameters: {} } }] }, (chunk) => { text += chunk; }, () => {}, (e) => { throw e; });
  assert.equal(text, 'ok');
  assert.equal(bodies.length, 4);
  for (const body of bodies) assert.equal(body.tools.length, 1);
  for (const body of bodies.slice(1)) assert.equal(body.stream_options, undefined);
  for (const body of bodies.slice(2)) assert.equal(body.service_tier, undefined);
  assert.equal(bodies[3].reasoning_effort, undefined);
});

test('Retry-After supports delta seconds and HTTP dates; never retries before a long window', async () => {
  assert.equal(upstreamRetryDelayMs(429, 0, '120'), 120000);
  const date = new Date(Date.now() + 90000).toUTCString();
  assert.ok(upstreamRetryDelayMs(429, 0, date) > 88000);
  for (const streaming of [false, true]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('rpm exhausted', { status: 429, headers: { 'Retry-After': '120' } }); };
    if (streaming) await streamChatCompletion(opts, () => {}, () => {}, () => {});
    else await assert.rejects(() => callChatCompletion(opts), { status: 429 });
    assert.equal(calls, 1);
  }
});

test('permanent quota is terminal; temporary RPM quota is not mistaken for spent balance', async () => {
  assert.equal(isPermanentQuotaError('{"type":"quota_exceeded_error","message":"rpm exhausted"}'), false);
  assert.equal(isPermanentQuotaError('{"type":"insufficient_quota"}'), true);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{"error":"insufficient_quota"}', { status: 429 }); };
  await assert.rejects(() => callChatCompletion(opts), { status: 429, retryable: false });
  assert.equal(calls, 1);
});

test('provider errors inside HTTP 200, including an EOF frame, are not empty successes', async () => {
  for (const code of [1002, 1004, 1008, 2013]) {
    const payload = { base_resp: { status_code: code, status_msg: 'provider error' } };
    const expected = { 1002: 429, 1004: 401, 1008: 402, 2013: 400 }[code];
    globalThis.fetch = async () => new Response(JSON.stringify(payload));
    await assert.rejects(() => callChatCompletion(opts), { status: expected, retryable: false });
    for (const frame of [JSON.stringify(payload) + '\n', 'data:' + JSON.stringify(payload), 'data: ' + JSON.stringify(payload) + '\n\n']) {
      globalThis.fetch = async () => new Response(frame);
      let error, done = false;
      await streamChatCompletion(opts, () => {}, () => { done = true; }, (e) => { error = e; });
      assert.equal(error?.status, expected);
      assert.equal(done, false);
    }
  }
  globalThis.fetch = async () => new Response(JSON.stringify({ base_resp: { status_code: 0, status_msg: '' }, choices: [{ message: { content: 'success' } }] }));
  assert.equal((await callChatCompletion(opts)).content, 'success');
});

test('valid SSE data does not require a space after the colon', async () => {
  globalThis.fetch = async () => new Response('data:{"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata:[DONE]\n\n');
  let text = '';
  await streamChatCompletion(opts, (chunk) => { text += chunk; }, () => {}, (e) => { throw e; });
  assert.equal(text, 'ok');
});

test('real server emitter -> frontend error contract never replays exhausted 400/429/503', () => {
  for (const status of [400, 401, 429, 503]) {
    let frames = '';
    const res = { write: (s) => { frames += s; }, end() {} };
    new SseEmitter(res, () => false).fatal(new LlmProviderError(status, 'secret upstream response'));
    const body = JSON.parse(frames.match(/data: (\{[^\n]+\})/)[1]);
    const error = makeStreamError(body.message, body.status, body);
    assert.equal(error.status, status);
    assert.equal(body.retryable, false);
    assert.equal(isRetryableAIError(error), false);
    assert.equal(frames.includes('secret upstream response'), false);
    assert.match(frames, /data: \[DONE\]/);
  }
});
