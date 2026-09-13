import test from 'node:test';
import assert from 'node:assert/strict';

/* Regression tests for the inline-<think> scanner in chat/stream.js.
 *
 * 1. Tiny head chunks: the scanner holds back up to 7 chars per frame to
 *    reassemble a `<think>` split across chunks. The first frame(s) of a
 *    plain answer therefore emit nothing until more text arrives — the
 *    end-of-stream flush must return those head chars so the saved
 *    message is complete.
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

async function runStream(frames) {
  const { callAPIStream } = await import('../src/chat/stream.js');
  let full = '';
  const thinking = [];
  const result = await callAPIStream(
    [{ role: 'user', content: 'hi' }],
    256,
    (_delta, acc) => { full = acc; },
    (t) => { thinking.push(t); },
    {},
  );
  return { result, full, thinking: thinking.join('') };
}

test('tiny head chunks survive the 7-char think-tag hold', async () => {
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
