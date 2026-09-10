import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.CSS = dom.window.CSS;

const { createToolRuntime } = await import('../src/chat/toolRuntime.ts');
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
  assert.ok(Object.keys(message._orphanProgress).length <= 50, 'keys capped');
  for (let i = 0; i < 60; i++) {
    h.runtime.recordToolProgress({ id: 'same-ghost', phase: 'stdout', chunk: 'x', elapsedMs: 10 });
  }
  const lists = Object.values(message._orphanProgress);
  for (const list of lists) assert.ok(list.length <= 50, 'lists capped');
  h.dispose();
});

test('M4 orphan deltas are capped after flush', () => {
  const message = { toolCalls: [] };
  const h = makeRuntime(message);
  for (let i = 0; i < 60; i++) {
    h.runtime.recordToolCallDelta({ id: `early-${i}`, index: 0, arguments: '{"a":1}' });
  }
  h.flush();
  assert.ok(Object.keys(message._orphanDeltas).length <= 50, 'delta keys capped');
  h.dispose();
});

test('M4 orphan approvals are capped', () => {
  const message = { toolCalls: [] };
  const h = makeRuntime(message);
  for (let i = 0; i < 60; i++) {
    h.runtime.recordToolApproval({ id: `nope-${i}`, runId: `run-${i}`, approvalId: `ap-${i}` });
  }
  assert.ok(Object.keys(message._orphanApprovals).length <= 50, 'approval keys capped');
  h.dispose();
});
