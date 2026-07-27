import assert from 'node:assert/strict';
import test from 'node:test';

import { createToolRuntime } from '../src/chat/toolRuntime.ts';

function makeBody() {
  return {
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

test('ToolRuntime coalesces orphan deltas before a tool card exists', () => {
  const message = { toolCalls: [] };
  let scheduled = null;
  const runtime = createToolRuntime({
    body: makeBody(),
    stillOwnsSlot: () => true,
    getMessage: () => message,
    requestAnimationFrame(callback) { scheduled = callback; return 11; },
    cancelAnimationFrame() {},
    EventSource: null,
    mode: 'detailed',
  });

  runtime.recordToolCallDelta({ id: 'early', index: 0, arguments: '{"code":"a"}' });
  runtime.recordToolCallDelta({ id: 'early', index: 0, arguments: '{"code":"ab"}', final: true });
  assert.equal(typeof scheduled, 'function');
  scheduled();

  assert.equal(message._orphanDeltas.early.length, 1);
  assert.equal(message._orphanDeltas.early[0].arguments, '{"code":"ab"}');
  runtime.dispose();
});

test('ToolRuntime dispose cancels queued work and closes execution streams', () => {
  const message = { toolCalls: [{ id: 'code-1', name: 'code_interpreter' }] };
  let cancelledFrame = null;
  let scheduled = null;
  const sources = [];

  class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.closed = false;
      this.listeners = {};
      sources.push(this);
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    close() { this.closed = true; }
  }

  const runtime = createToolRuntime({
    body: makeBody(),
    stillOwnsSlot: () => true,
    getMessage: () => message,
    requestAnimationFrame(callback) { scheduled = callback; return 17; },
    cancelAnimationFrame(id) { cancelledFrame = id; },
    EventSource: FakeEventSource,
    mode: 'detailed',
  });

  runtime.recordExecutionStart({ id: 'code-1', executionId: 'exec-1' });
  runtime.recordToolCallDelta({ id: 'code-1', index: 0, arguments: '{}' });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, '/api/executions/exec-1/stream');
  assert.equal(typeof scheduled, 'function');

  runtime.dispose();
  assert.equal(sources[0].closed, true);
  assert.equal(cancelledFrame, 17);

  scheduled = null;
  runtime.recordToolCallDelta({ id: 'late', index: 0, arguments: '{}' });
  assert.equal(scheduled, null);
});

test('ToolRuntime compact mode skips tool_card_delta scheduling and card creation', () => {
  const message = { toolCalls: [] };
  let scheduled = null;
  let appended = 0;
  const runtime = createToolRuntime({
    body: {
      querySelector() { return null; },
      querySelectorAll() { appended++; return []; },
    },
    stillOwnsSlot: () => true,
    getMessage: () => message,
    requestAnimationFrame(callback) { scheduled = callback; return 19; },
    cancelAnimationFrame() {},
    EventSource: null,
    mode: 'compact',
  });

  // recordToolCallDelta must NOT schedule a flush in compact mode —
  // no .agent-tool-card exists to update.
  runtime.recordToolCallDelta({ id: 'no-card', index: 0, arguments: '{"code":"x"}' });
  assert.equal(scheduled, null);

  // recordToolUse pushes the entry onto the message but creates no
  // DOM card. The returned element is null.
  const out = runtime.recordToolUse({ id: 'no-card', name: 'web_search', input: { query: 'q' } });
  assert.equal(out, null);
  assert.equal(message.toolCalls.length, 1);
  assert.equal(message.toolCalls[0].name, 'web_search');
  // No .agent-tool-card was queried for — the body.querySelectorAll
  // hook would have been called if anything tried to enumerate cards.
  assert.equal(appended, 0);
  runtime.dispose();
});
