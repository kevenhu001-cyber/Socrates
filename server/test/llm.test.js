// @ts-check
/**
 * Unit tests for src/services/llm.js — the SSE chat-completion
 * proxy. This module is a security boundary (user-supplied API
 * keys, model output, tool-call dispatch) and the streaming
 * pipeline has multiple subtle branches: silence watchdog, abort
 * cascade, tool_call delta throttling, finish_reason dispatch.
 *
 * We stub globalThis.fetch with an in-memory SSE stream so the
 * tests don't require network. Node 20+ provides Response /
 * ReadableStream globally, which makes this a few dozen lines.
 *
 * Run with: npm test
 */
import { test, describe, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  streamChatCompletion,
  callChatCompletion,
} from '../src/services/llm.js';

const ORIG_FETCH = globalThis.fetch;

/* ── SSE fixture helpers ──────────────────────────────────────── */

function sseChunk(json) {
  return `data: ${JSON.stringify(json)}\n\n`;
}

function sseDone() {
  return 'data: [DONE]\n\n';
}

/**
 * Build a Response whose body is an SSE stream of the supplied events.
 * Pass an array of (string|object) — strings are emitted verbatim
 * (use this to inject malformed frames), objects are JSON-encoded
 * with the `data: ` prefix.
 */
function makeSseResponse(events) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const ev of events) {
        if (typeof ev === 'string') {
          controller.enqueue(encoder.encode(ev));
        } else {
          controller.enqueue(encoder.encode(sseChunk(ev)));
        }
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function makeJsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeEmptyResponse(status = 200) {
  return new Response(null, { status });
}

afterEach(() => {
  globalThis.fetch = ORIG_FETCH;
});

/* ── Shared opts ──────────────────────────────────────────────── */

const BASE_OPTS = Object.freeze({
  apiBase: 'https://llm.example.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-test',
  messages: [{ role: 'user', content: 'hi' }],
});

/* ── streamChatCompletion ─────────────────────────────────────── */

describe('streamChatCompletion: happy path', () => {
  test('emits text deltas via onChunk and calls onDone with finishReason', async () => {
    globalThis.fetch = mock.fn(async () =>
      makeSseResponse([
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: ' world' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
        sseDone(),
      ]),
    );

    const chunks = [];
    let donePayload = null;
    let error = null;
    await streamChatCompletion(
      { ...BASE_OPTS },
      (c) => chunks.push(c),
      (d) => { donePayload = d; },
      (e) => { error = e; },
    );

    assert.equal(error, null, 'no error expected');
    assert.deepEqual(chunks, ['Hello', ' world']);
    assert.deepEqual(donePayload, { finishReason: 'stop' });

    const call = globalThis.fetch.mock.calls[0];
    assert.equal(call.arguments[0], `${BASE_OPTS.apiBase}/chat/completions`);
    const sentBody = JSON.parse(call.arguments[1].body);
    assert.equal(sentBody.stream, true);
    assert.equal(sentBody.model, BASE_OPTS.model);
  });

  test('forwards max_tokens default of 32000 when not provided', async () => {
    globalThis.fetch = mock.fn(async () =>
      makeSseResponse([{ choices: [{ delta: { content: 'x' }, finish_reason: 'stop' }] }, sseDone()]),
    );
    await streamChatCompletion({ ...BASE_OPTS }, () => {}, () => {}, () => {});
    const sentBody = JSON.parse(globalThis.fetch.mock.calls[0].arguments[1].body);
    assert.equal(sentBody.max_tokens, 32000);
  });

  test('uses caller-provided maxTokens instead of default', async () => {
    globalThis.fetch = mock.fn(async () =>
      makeSseResponse([{ choices: [{ delta: { content: 'x' }, finish_reason: 'stop' }] }, sseDone()]),
    );
    await streamChatCompletion({ ...BASE_OPTS, maxTokens: 512 }, () => {}, () => {}, () => {});
    const sentBody = JSON.parse(globalThis.fetch.mock.calls[0].arguments[1].body);
    assert.equal(sentBody.max_tokens, 512);
  });

  test('forwards reasoning_effort and extra_body when provided', async () => {
    globalThis.fetch = mock.fn(async () =>
      makeSseResponse([{ choices: [{ delta: { content: 'x' }, finish_reason: 'stop' }] }, sseDone()]),
    );
    await streamChatCompletion(
      {
        ...BASE_OPTS,
        reasoning_effort: 'high',
        extra_body: { thinking: { type: 'enabled' } },
      },
      () => {}, () => {}, () => {},
    );
    const sentBody = JSON.parse(globalThis.fetch.mock.calls[0].arguments[1].body);
    assert.equal(sentBody.reasoning_effort, 'high');
    assert.deepEqual(sentBody.thinking, { type: 'enabled' });
  });
});

describe('streamChatCompletion: reasoning_content', () => {
  test('routes DeepSeek-style reasoning_content to onReasoning', async () => {
    globalThis.fetch = mock.fn(async () =>
      makeSseResponse([
        { choices: [{ delta: { reasoning_content: 'thinking... ' } }] },
        { choices: [{ delta: { reasoning_content: 'more thinking' } }] },
        { choices: [{ delta: { content: 'final' }, finish_reason: 'stop' }] },
        sseDone(),
      ]),
    );
    const reasoning = [];
    const text = [];
    await streamChatCompletion(
      { ...BASE_OPTS },
      (c) => text.push(c),
      () => {},
      () => {},
      (r) => reasoning.push(r),
    );
    assert.deepEqual(reasoning, ['thinking... ', 'more thinking']);
    assert.deepEqual(text, ['final']);
  });
});

describe('streamChatCompletion: tool_calls', () => {
  /* Two SSE frames whose `function.arguments` strings concatenate
     to '{"location":"SF"}'. The fixture below is built with
     template literals so we don't have to escape inner double quotes
     — easier to read and impossible to mis-balance. */
  const ARG_PART_A = `{"loc`;
  const ARG_PART_B = `ation":"SF"}`;

  test('accumulates indexed tool_call deltas and dispatches onToolUse when finish_reason=tool_calls', async () => {
    globalThis.fetch = mock.fn(async () =>
      makeSseResponse([
        { choices: [{ delta: { tool_calls: [{
          index: 0,
          id: 'call_1',
          function: { name: 'get_weather', arguments: ARG_PART_A },
        }] } }] },
        { choices: [{ delta: { tool_calls: [{
          index: 0,
          function: { arguments: ARG_PART_B },
        }] } }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        sseDone(),
      ]),
    );
    const tools = [];
    const deltas = [];
    await streamChatCompletion(
      { ...BASE_OPTS, tools: [{ type: 'function', function: { name: 'get_weather' } }] },
      () => {}, () => {}, () => {}, () => {},
      (tc) => tools.push(tc),
      (tc) => deltas.push(tc),
    );
    assert.equal(tools.length, 1);
    assert.equal(tools[0].id, 'call_1');
    assert.equal(tools[0].function.name, 'get_weather');
    assert.equal(tools[0].function.arguments, `${ARG_PART_A}${ARG_PART_B}`);
    /* onToolCallDelta must have been emitted at least once; the
       final frame carries the full reconstructed string. */
    assert.ok(deltas.length >= 1, 'at least one tool_call_delta frame expected');
    const last = deltas[deltas.length - 1];
    assert.equal(last.arguments, `${ARG_PART_A}${ARG_PART_B}`);
    assert.equal(last.final, true);
  });

  test('does NOT dispatch onToolUse when finish_reason is "stop" even if tool_calls were streamed', async () => {
    globalThis.fetch = mock.fn(async () =>
      makeSseResponse([
        { choices: [{ delta: { tool_calls: [{
          index: 0, id: 'call_x',
          function: { name: 'noop', arguments: '{}' },
        }] } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
        sseDone(),
      ]),
    );
    const tools = [];
    await streamChatCompletion(
      { ...BASE_OPTS, tools: [{ type: 'function', function: { name: 'noop' } }] },
      () => {}, () => {}, () => {}, () => {},
      (tc) => tools.push(tc),
    );
    assert.equal(tools.length, 0, 'no onToolUse when finish_reason !== "tool_calls"');
  });
});

describe('streamChatCompletion: error & edge cases', () => {
  test('forwards upstream 4xx as onError', async () => {
    globalThis.fetch = mock.fn(async () =>
      makeJsonResponse({ error: 'rate_limited' }, 429),
    );
    let error = null;
    let done = null;
    await streamChatCompletion(
      { ...BASE_OPTS },
      () => {},
      (d) => { done = d; },
      (e) => { error = e; },
    );
    assert.ok(error instanceof Error);
    assert.match(error.message, /LLM API error 429/);
    assert.equal(done, null);
  });

  test('forwards upstream 5xx as onError', async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response('upstream dead', { status: 502 }),
    );
    let error = null;
    await streamChatCompletion({ ...BASE_OPTS }, () => {}, () => {}, (e) => { error = e; });
    assert.match(error.message, /LLM API error 502/);
  });

  test('calls onError when upstream returns an empty body', async () => {
    globalThis.fetch = mock.fn(async () => makeEmptyResponse(200));
    let error = null;
    await streamChatCompletion({ ...BASE_OPTS }, () => {}, () => {}, (e) => { error = e; });
    assert.match(error.message, /empty body/);
  });

  test('skips malformed JSON frames without throwing', async () => {
    globalThis.fetch = mock.fn(async () =>
      makeSseResponse([
        // Newline-terminated so the streaming parser doesn't glue this
        // broken frame onto the next valid one in the buffer.
        'data: {not json}\n\n',
        sseChunk({ choices: [{ delta: { content: 'still works' }, finish_reason: 'stop' }] }),
        sseDone(),
      ]),
    );
    const chunks = [];
    let error = null;
    await streamChatCompletion(
      { ...BASE_OPTS },
      (c) => chunks.push(c),
      () => {},
      (e) => { error = e; },
    );
    assert.equal(error, null);
    assert.deepEqual(chunks, ['still works']);
  });

  test('honours caller AbortSignal — clean onDone on client disconnect', async () => {
    const encoder = new TextEncoder();
    globalThis.fetch = mock.fn(async (_url, init) => {
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(sseChunk({ choices: [{ delta: { content: 'partial' } }] })));
          await new Promise((resolve) => {
            const sig = init && init.signal;
            if (!sig) { resolve(); return; }
            if (sig.aborted) { resolve(); return; }
            sig.addEventListener('abort', resolve, { once: true });
          });
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    });

    const ac = new AbortController();
    const chunks = [];
    let done = null;
    let error = null;
    const p = streamChatCompletion(
      { ...BASE_OPTS, signal: ac.signal },
      (c) => chunks.push(c),
      (d) => { done = d; },
      (e) => { error = e; },
    );
    await new Promise((r) => setTimeout(r, 5));
    ac.abort();
    await p;

    assert.equal(error, null, 'client abort should not surface as error');
    assert.deepEqual(done, { finishReason: null });
  });
});

/* ── callChatCompletion (non-streaming) ───────────────────────── */

describe('callChatCompletion', () => {
  test('returns parsed content from upstream', async () => {
    globalThis.fetch = mock.fn(async () =>
      makeJsonResponse({
        choices: [{ message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' }],
      }),
    );
    const result = await callChatCompletion({ ...BASE_OPTS });
    assert.equal(result.content, 'pong');
    assert.equal(result.finish_reason, 'stop');
    assert.equal(result.reasoning_content, undefined);
  });

  test('returns reasoning_content when present (DeepSeek-style)', async () => {
    globalThis.fetch = mock.fn(async () =>
      makeJsonResponse({
        choices: [{ message: { content: 'answer', reasoning_content: 'because' } }],
      }),
    );
    const result = await callChatCompletion({ ...BASE_OPTS });
    assert.equal(result.content, 'answer');
    assert.equal(result.reasoning_content, 'because');
  });

  test('returns tool_calls when present', async () => {
    globalThis.fetch = mock.fn(async () =>
      makeJsonResponse({
        choices: [{ message: {
          content: '',
          tool_calls: [{ id: 'c1', type: 'function', function: { name: 'foo', arguments: '{}' } }],
        } }],
      }),
    );
    const result = await callChatCompletion({ ...BASE_OPTS });
    assert.equal(result.tool_calls.length, 1);
    assert.equal(result.tool_calls[0].function.name, 'foo');
  });

  test('throws ApiError carrying the upstream status on 4xx/5xx', async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response('{"error":"quota exceeded"}', { status: 429 }),
    );
    let err = null;
    try {
      await callChatCompletion({ ...BASE_OPTS });
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'expected throw');
    assert.equal(err.status, 429);
    assert.equal(err.code, 'LLM_API_ERROR');
  });
});