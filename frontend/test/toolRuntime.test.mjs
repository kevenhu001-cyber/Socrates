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
    useExecutionEventSource: true,
    mode: 'detailed',
  });

  runtime.recordExecutionStart({ id: 'code-1', executionId: 'exec-1' });
  runtime.recordExecutionStart({ id: 'code-1', executionId: 'exec-1' });
  assert.equal(sources.length, 1, 'duplicate execution_start must reuse the EventSource');
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

test('ToolRuntime treats duplicate tool_use events as idempotent', () => {
  const message = { toolCalls: [] };
  const mounted = [];
  globalThis.document = {
    createElement(tag) {
      return { tagName: tag, dataset: {}, className: '', innerHTML: '' };
    },
  };
  try {
    const runtime = createToolRuntime({
      body: { querySelector() { return null; }, querySelectorAll() { return []; } },
      getMessage: () => message,
      onInlineTool(entry, row) { mounted.push({ entry, row }); },
      EventSource: null,
      mode: 'compact',
    });

    runtime.recordToolUse({ id: 'same-call', name: 'web_search', input: { query: 'first' } });
    runtime.recordToolUse({ id: 'same-call', name: 'web_search', input: { query: 'second' } });

    assert.equal(message.toolCalls.length, 1);
    assert.equal(mounted.length, 1);
    assert.deepEqual(message.toolCalls[0].input, { query: 'second' });
    runtime.dispose();
  } finally {
    delete globalThis.document;
  }
});

test('ToolRuntime drains progress that arrives before tool_use', () => {
  const message = { toolCalls: [] };
  globalThis.document = {
    createElement(tag) {
      return { tagName: tag, dataset: {}, className: '', innerHTML: '' };
    },
  };
  try {
    const runtime = createToolRuntime({
      body: { querySelector() { return null; }, querySelectorAll() { return []; } },
      getMessage: () => message,
      onInlineTool() {},
      EventSource: null,
      mode: 'compact',
    });

    runtime.recordToolProgress({ id: 'late-use', phase: 'running', elapsedMs: 125 });
    assert.equal(message._orphanProgress['late-use'].length, 1);
    runtime.recordToolUse({ id: 'late-use', name: 'web_search', input: { query: 'q' } });

    assert.equal(message._orphanProgress['late-use'], undefined);
    assert.equal(message.toolCalls[0]._run.phase, 'running');
    assert.equal(message.toolCalls[0]._run.elapsedMs, 125);
    runtime.dispose();
  } finally {
    delete globalThis.document;
  }
});

test('ToolRuntime uses the main chat SSE as the default execution channel', () => {
  const message = { toolCalls: [{ id: 'code-main', name: 'code_interpreter' }] };
  const sources = [];
  class FakeEventSource {
    constructor(url) { this.url = url; sources.push(this); }
    addEventListener() {}
    close() {}
  }
  const runtime = createToolRuntime({
    body: makeBody(),
    getMessage: () => message,
    EventSource: FakeEventSource,
    mode: 'detailed',
  });

  runtime.recordExecutionStart({ id: 'code-main', executionId: 'exec-main' });
  assert.equal(sources.length, 0, 'secondary execution SSE must be opt-in');
  runtime.dispose();
});

test('ToolRuntime does not open a progress stream after a terminal result', () => {
  const message = { toolCalls: [] };
  const sources = [];
  class FakeEventSource {
    constructor(url) { this.url = url; this.listeners = {}; sources.push(this); }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    close() {}
  }
  globalThis.document = {
    createElement(tag) {
      return { tagName: tag, dataset: {}, className: '', innerHTML: '' };
    },
  };
  try {
    const runtime = createToolRuntime({
      body: makeBody(),
      getMessage: () => message,
      onInlineTool() {},
      EventSource: FakeEventSource,
      useExecutionEventSource: true,
      mode: 'compact',
    });

    runtime.recordToolResult({
      id: 'already-done',
      name: 'code_interpreter',
      executionId: 'exec-done',
      ok: true,
      status: 'completed',
      output: 'done',
    });
    runtime.recordExecutionStart({ id: 'already-done', executionId: 'exec-done' });

    assert.equal(sources.length, 0);
    runtime.dispose();
  } finally {
    delete globalThis.document;
  }
});

test('ToolRuntime compact mode mounts inline rows instead of cards', () => {
  const message = { toolCalls: [] };
  let scheduled = null;
  let appended = 0;
  const mounted = [];
  let mountedRow = null;
  // Minimal DOM stub — createInlineToolRow only needs an element with
  // dataset / className / innerHTML; updateInlineToolCodePreview needs a
  // .tool-inline-detail child and appendChild.
  const makeDetail = () => ({
    dataset: {}, textContent: '', querySelector: () => null,
    appendChild() {}, replaceChildren() {},
  });
  globalThis.document = {
    createElement(tag) {
      return {
        tagName: tag, dataset: {}, className: '', innerHTML: '', textContent: '',
        querySelector(sel) { return sel === '.tool-inline-detail' ? makeDetail() : null; },
        appendChild() {}, replaceChildren() {},
      };
    },
  };
  try {
    const body = {
      querySelector() { return null; },
      querySelectorAll(sel) {
        appended++;
        return sel.indexOf('.tool-inline') === 0 && mountedRow ? [mountedRow] : [];
      },
    };
    const runtime = createToolRuntime({
      body,
      stillOwnsSlot: () => true,
      getMessage: () => message,
      onInlineTool(entry, row) { mounted.push({ entry, row }); return 42; },
      requestAnimationFrame(callback) { scheduled = callback; return 19; },
      cancelAnimationFrame() {},
      EventSource: null,
      mode: 'compact',
    });

    // P_tool-delta-stream — compact rows now render live code previews,
    // so recordToolCallDelta schedules the rAF flush instead of dropping
    // the delta (there was no card to update before this fix).
    runtime.recordToolCallDelta({ id: 'no-card', index: 0, arguments: '{"code":"x"}' });
    assert.notEqual(scheduled, null);

    // recordToolUse pushes the entry onto the message, drains the
    // buffered delta into the entry, and hands a running .tool-inline
    // row to onInlineTool. No legacy card DOM.
    const out = runtime.recordToolUse({ id: 'no-card', name: 'web_search', input: { query: 'q' } });
    assert.equal(out, null);
    assert.equal(message.toolCalls.length, 1);
    assert.equal(message.toolCalls[0].name, 'web_search');
    assert.equal(message.toolCalls[0].input.__raw, '{"code":"x"}');
    assert.equal(mounted.length, 1);
    mountedRow = mounted[0].row;
    assert.equal(mounted[0].entry.id, 'no-card');
    assert.equal(mounted[0].row.className, 'tool-inline');
    assert.equal(mounted[0].row.dataset.tool, 'web_search');
    assert.equal(mounted[0].row.dataset.state, 'running');
    // No .agent-tool-card was enumerated yet — the body.querySelectorAll
    // hook only fires when the flush runs.
    assert.equal(appended, 0);

    // The flush had its delta drained by recordToolUse, so it early-
    // returns without touching the DOM.
    const flush = scheduled;
    scheduled = null;
    flush();
    assert.equal(appended, 0);
    runtime.dispose();
  } finally {
    delete globalThis.document;
  }
});
