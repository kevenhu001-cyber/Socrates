import assert from 'node:assert/strict';
import test from 'node:test';

import { createToolRuntime } from '../src/chat/toolRuntime.js';

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
