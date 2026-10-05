import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.CSS = dom.window.CSS;

const { createToolRuntime: createRuntime } = await import('../src/chat/toolRuntime.ts');
const { toolRunLabel } = await import('../src/react/tool-run/labels.ts');

function makeBody() {
  return {
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

function makeRuntime(message) {
  let scheduled = null;
  const runtime = createToolRuntime({
    body: makeBody(),
    stillOwnsSlot: () => true,
    getMessage: () => message,
    requestAnimationFrame(callback) { scheduled = callback; return 1; },
    cancelAnimationFrame() {},
    EventSource: null,
    mode: 'detailed',
  });
  return {
    runtime,
    flush() { if (scheduled) { const fn = scheduled; scheduled = null; fn(); } },
    dispose() { runtime.dispose(); },
  };
}

/* M4 single-source copy: the legacy summary line (activeToolLabel) delegates
   to the same headline builder the React rows paint with, so object-carrying
   copy ("Searching \"q\"…") reaches both surfaces instead of the old generic
   verbs living in a second table. */
test('M4 summary copy carries the tool object like the React row', () => {
  assert.equal(toolRunLabel({ name: 'web_search', input: { query: 'fusion coils' } }, 'running').text, 'Searching "fusion coils"…');
  assert.equal(toolRunLabel({ name: 'code_interpreter', input: {} }, 'running').text, 'Executing code…');
  assert.equal(toolRunLabel({ name: 'code_interpreter', input: {}, _progressPhase: 'stdout' }, 'running').text, 'Analyzing data…');
  assert.equal(toolRunLabel({ name: 'mystery_tool' }, 'running').text, 'Using a tool');
});

/* M4 bounded queues: a storm of pre-use frames degrades to dropping the
   oldest instead of growing the message object without bound. */
test('M4 orphan progress is capped by key and by list', () => {
  const message = { toolCalls: [] };
  const h = makeRuntime(message);
  for (let i = 0; i < 60; i++) {
    h.runtime.recordToolProgress({ id: `ghost-${i}`, phase: 'stdout', chunk: 'x', elapsedMs: 10 });
  }
  h.runtime.recordToolUse({id: 'ghost-0', name: 'code_interpreter'});
  assert.equal(message.toolCalls[0]._liveOutput, undefined, 'oldest orphan key evicted');
  for (let i = 0; i < 60; i++) {
    h.runtime.recordToolProgress({ id: 'same-ghost', phase: 'stdout', chunk: 'x', elapsedMs: 10 });
  }
  h.runtime.recordToolUse({id: 'same-ghost', name: 'code_interpreter'});
  assert.equal(message.toolCalls.at(-1)._liveOutput.length, 50, 'only the last 50 chunks replay');
  h.dispose();
});

test('M4 orphan deltas are capped after flush', () => {
  const message = { toolCalls: [] };
  const h = makeRuntime(message);
  for (let i = 0; i < 60; i++) {
    h.runtime.recordToolCallDelta({ id: `early-${i}`, index: 0, arguments: '{"a":1}' });
  }
  h.flush();
  h.runtime.recordToolUse({id: 'early-0', name: 'code_interpreter'});
  assert.equal(message.toolCalls[0].argumentsText, undefined);
  h.runtime.recordToolUse({id: 'early-59', name: 'code_interpreter'});
  assert.equal(message.toolCalls.at(-1).argumentsText, '{"a":1}');
  h.dispose();
});

test('M4 orphan approvals are capped', () => {
  const message = { toolCalls: [] };
  const h = makeRuntime(message);
  for (let i = 0; i < 60; i++) {
    h.runtime.recordToolApproval({ id: `nope-${i}`, runId: `run-${i}`, approvalId: `ap-${i}` });
  }
  h.runtime.recordToolUse({id: 'nope-0', name: 'workspace_agent'});
  assert.equal(message.toolCalls[0].approval, undefined);
  h.runtime.recordToolUse({id: 'nope-59', name: 'workspace_agent'});
  assert.equal(message.toolCalls.at(-1).approval.approvalId, 'ap-59');
  h.dispose();
});

// The shell mirrors session/update-message; entries are replaced on each commit.
function createToolRuntime(options) {
  return createRuntime({...options, updateMessage(patch) {
    Object.assign(options.getMessage(), patch);
  }});
}
