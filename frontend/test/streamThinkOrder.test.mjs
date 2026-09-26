import test from 'node:test';
import assert from 'node:assert/strict';

/* Regression tests for the inline-<think> scanner in chat/stream.js.
 *
 * 1. Tiny head chunks: the scanner holds back a trailing partial `<think`
 *    so a tag split across chunks can be reassembled. Only that partial
 *    tag may wait (P_think-tail-hold): ordinary prose is emitted with the
 *    delta that carried it, and the end-of-stream flush still returns
 *    anything held so the saved message is complete.
 *
 * 2. Back-to-back think blocks in ONE frame (`</think>HEAD<think>…`):
 *    the remainder after the first close must be reprocessed BEFORE
 *    anything is emitted. Emitting first and reprocessing after
 *    duplicates the head of the post-think content and scrambles the
 *    order (user-facing: garbled / swallowed first chars).
 *
 * Harness mirrors streamFinalFrame.test.mjs: mock global fetch (which
 * apiFetchRaw wraps) so no module mocking is needed.
 */

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
  globalThis.document = { cookie: '' };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    body: makeReader(chunks),
  });
  globalThis.window = {
    getActiveProvider: () => ({ isBuiltIn: false, name: 'test' }),
    getCsrfToken: () => null,
    sleepBackoff: async () => {},
    offlineGuard: () => false,
    isReasoningProvider: () => false,
    STREAM_RETRYABLE_STATUS: {},
    STREAM_MAX_ATTEMPTS: 1,
    appMode: 'chat',
  };
}

function frame(content) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

function eventFrame(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function runStream(options = {}) {
  const { callAPIStream } = await import('../src/chat/stream.js');
  let full = '';
  const thinking = [];
  const events = [];
  const result = await callAPIStream(
    [{ role: 'user', content: 'hi' }],
    256,
    (delta, acc) => {
      full = acc;
      events.push({ type: 'text', delta, full: acc });
    },
    (t) => { thinking.push(t); },
    {
      onToolUse: (calls) => {
        events.push({ type: 'tool_use', full });
        if (options.onToolUse) options.onToolUse(calls, full);
      },
    },
  );
  return { result, full, thinking: thinking.join(''), events };
}

test('tiny head chunks survive the think-tag hold', async () => {
  installEnvironment([
    frame('你好'),
    frame('，我是'),
    frame('AI助手，很高兴为你服务。'),
  ]);

  const { result, full } = await runStream();
  assert.ok(result, 'stream should resolve to a result');
  assert.equal(result.cancelled, false);
  assert.equal(result.text, '你好，我是AI助手，很高兴为你服务。');
  assert.equal(full, '你好，我是AI助手，很高兴为你服务。');
});

test('back-to-back think blocks in one frame keep content order, no duplication', async () => {
  installEnvironment([
    frame('前言<think>思考中'),
    frame('继续</think>AB<think>第二段思考</think>正文尾巴'),
  ]);

  const { result, full, thinking } = await runStream();
  assert.ok(result, 'stream should resolve to a result');
  assert.equal(result.cancelled, false);
  /* Think content routes to the thinking channel; visible prose keeps
     its exact order with no duplicated head. */
  assert.equal(result.text, '前言AB正文尾巴');
  assert.equal(full, '前言AB正文尾巴');
  assert.match(thinking, /思考中继续/);
  assert.match(thinking, /第二段思考/);
  /* The head after the first close must appear exactly once. */
  assert.equal(result.text.indexOf('AB'), result.text.lastIndexOf('AB'));
});

test('tool_use commits chunked visible text before the call offset is observed', async () => {
  installEnvironment([
    frame('A short preamble split'),
    frame(' across deltas before the tool'),
    eventFrame('tool_use', [{ id: 'tool-1', name: 'web_search' }]),
    frame(' and a follow-up sentence.'),
  ]);

  const offsets = [];
  const { result, full, events } = await runStream({
    onToolUse: (_calls, textAtCall) => offsets.push(textAtCall),
  });
  const toolIndex = events.findIndex((event) => event.type === 'tool_use');
  assert.equal(offsets[0], 'A short preamble split across deltas before the tool');
  assert.ok(toolIndex > 0, 'tool_use should follow the committed visible-text callbacks');
  assert.equal(events.slice(0, toolIndex).at(-1).full, offsets[0]);
  assert.equal(result.text, 'A short preamble split across deltas before the tool and a follow-up sentence.');
  assert.equal(full, result.text);
});

test('tool_use preserves a partial opening think tag for the next content delta', async () => {
  installEnvironment([
    frame('Visible before <thi'),
    eventFrame('tool_use', [{ id: 'tool-2', name: 'web_search' }]),
    frame('nk>private</think>visible after.'),
  ]);

  const offsets = [];
  const { result, full, thinking } = await runStream({
    onToolUse: (_calls, textAtCall) => offsets.push(textAtCall),
  });
  assert.deepEqual(offsets, ['Visible before ']);
  assert.equal(result.text, 'Visible before visible after.');
  assert.equal(full, result.text);
  assert.equal(thinking, 'private');
  assert.ok(!offsets[0].includes('<thi'), 'an incomplete think marker is not visible text');
});

test('an incomplete think marker at EOF after tool_use never leaks into answer text', async () => {
  installEnvironment([
    frame('Visible before <thi'),
    eventFrame('tool_use', [{ id: 'tool-3', name: 'web_search' }]),
  ]);

  const offsets = [];
  const { result, full } = await runStream({
    onToolUse: (_calls, textAtCall) => offsets.push(textAtCall),
  });
  assert.deepEqual(offsets, ['Visible before ']);
  assert.equal(result.text, 'Visible before ');
  assert.equal(full, result.text);
});

test('plain prose reaches onDelta with the delta that carried it', async () => {
  /* P_think-tail-hold — the scanner used to keep the last 7 characters of
     every delta, so the typing frontier lagged and an answer's final
     characters only appeared with the finish re-render. */
  installEnvironment([
    frame('第一句话说完了。'),
    frame('第二句也说完了。'),
  ]);

  const { result, events } = await runStream();
  const texts = events.filter((event) => event.type === 'text');
  assert.equal(texts[0].full, '第一句话说完了。');
  assert.equal(texts[1].full, '第一句话说完了。第二句也说完了。');
  assert.equal(result.text, '第一句话说完了。第二句也说完了。');
});

test('only a trailing partial <think tag waits for the next chunk', async () => {
  installEnvironment([
    frame('Answer <th'),
    frame('ink>secret</think> done, and a < b stays prose.'),
  ]);

  const { result, events, thinking } = await runStream();
  const texts = events.filter((event) => event.type === 'text');
  assert.equal(texts[0].full, 'Answer ', 'the partial tag is held, the prose before it is not');
  assert.equal(result.text, 'Answer  done, and a < b stays prose.');
  assert.equal(thinking, 'secret');
});
