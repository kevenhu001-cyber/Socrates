import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

/* Data-only runtime: the tests assert on message.toolCalls[] (the single
   source react/tool-run renders from), never on mounted DOM. Rows, groups,
   approval panels and step hosts are drawn by React; the runtime only keeps
   the data current and publishes `tool-run-updated`. */
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.CSS = dom.window.CSS;

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
  const runtime = createToolRuntime({
    body: makeBody(),
    getMessage: () => message,
    onInlineTool(entry, row) { mounted.push({ entry, row }); },
    EventSource: null,
    mode: 'compact',
  });

  runtime.recordToolUse({ id: 'same-call', name: 'web_search', input: { query: 'first' } });
  runtime.recordToolUse({ id: 'same-call', name: 'web_search', input: { query: 'second' } });

  assert.equal(message.toolCalls.length, 1);
  assert.equal(mounted.length, 1);
  assert.equal(mounted[0].row, null, 'no DOM row is created — only the split point is recorded');
  assert.deepEqual(message.toolCalls[0].input, { query: 'second' });
  runtime.dispose();
});

test('ToolRuntime drains progress that arrives before tool_use', () => {
  const message = { toolCalls: [] };
  const runtime = createToolRuntime({
    body: makeBody(),
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
});

test('ToolRuntime records rows on the data instead of mounting DOM', () => {
  const message = { toolCalls: [] };
  let scheduled = null;
  const mounted = [];
  const runtime = createToolRuntime({
    body: makeBody(),
    stillOwnsSlot: () => true,
    getMessage: () => message,
    onInlineTool(entry, row) { mounted.push({ entry, row }); return 42; },
    requestAnimationFrame(callback) { scheduled = callback; return 19; },
    cancelAnimationFrame() {},
    EventSource: null,
    mode: 'compact',
  });

  // Deltas schedule the rAF flush; recordToolUse drains the buffer into
  // the entry before the flush runs.
  runtime.recordToolCallDelta({ id: 'no-card', index: 0, arguments: '{"code":"x"}' });
  assert.notEqual(scheduled, null, 'delta schedules a flush');

  // P_tool-delta-stream — deltas schedule the rAF flush; the flush lands
  // the cumulative arguments on the entry for the live preview.
  runtime.recordToolCallDelta({ id: 'no-card', index: 0, arguments: '{"code":"x"}' });
  assert.notEqual(scheduled, null);

  // recordToolUse pushes the entry onto the message, drains the buffered
  // delta into the entry, and records the split point. No DOM anywhere.
  const out = runtime.recordToolUse({ id: 'no-card', name: 'web_search', input: { query: 'q' } });
  assert.equal(out, null);
  assert.equal(message.toolCalls.length, 1);
  assert.equal(message.toolCalls[0].name, 'web_search');
  assert.equal(message.toolCalls[0].input.__raw, '{"code":"x"}');
  assert.equal(message.toolCalls[0].textOffset, 42, 'offset stamped at mount time');
  assert.equal(mounted.length, 1);
  assert.equal(mounted[0].entry.id, 'no-card');
  assert.equal(mounted[0].row, null, 'the host is asked for the split point only');

  // The buffered delta was drained by recordToolUse, so the scheduled
  // flush finds nothing and stays a no-op.
  assert.notEqual(scheduled, null);
  scheduled();
  assert.equal(message.toolCalls[0].argumentsText, '{"code":"x"}');
  runtime.dispose();
});

test('ToolRuntime exposes whether any tool is still active', () => {
  const message = {
    toolCalls: [{ id: 'running', name: 'code_interpreter', output: null, isError: false }],
  };
  const runtime = createToolRuntime({
    body: makeBody(),
    stillOwnsSlot: () => true,
    getMessage: () => message,
    EventSource: null,
  });

  assert.equal(runtime.hasActiveTools(), true);
  message.toolCalls[0].output = 'done';
  message.toolCalls[0]._toolResultApplied = true;
  assert.equal(runtime.hasActiveTools(), false);
  runtime.dispose();
});

/* ─── Retired surfaces: the live single-card slot and imperative grouping ──
   The slot was never mounted in production (streamingTurn deliberately left
   it unset) and grouping is derived by react/tool-run from textOffset
   adjacency. These pin the data contract that replaced them: every tool_use
   is persisted with its own split point, and terminal states land per entry. */

test('ToolRuntime ignores the retired live single-card slot and persists every call', () => {
  const message = { toolCalls: [] };
  const offsets = [10, 20, 30];
  let next = 0;
  const runtime = createToolRuntime({
    body: makeBody(),
    stillOwnsSlot: () => true,
    getMessage: () => message,
    liveSingleCardSlot: {},
    onInlineTool() { return offsets[next++]; },
    EventSource: null,
    mode: 'compact',
  });

  runtime.recordToolUse({ id: 'A', name: 'web_search', input: { q: 1 } });
  runtime.recordToolUse({ id: 'B', name: 'code_interpreter', input: { q: 2 } });
  runtime.recordToolUse({ id: 'C', name: 'web_search', input: { q: 3 } });

  assert.deepEqual(message.toolCalls.map((t) => t.id), ['A', 'B', 'C']);
  assert.deepEqual(message.toolCalls.map((t) => t.textOffset), [10, 20, 30],
    'each call keeps its own split point — no shared head offset');
  runtime.dispose();
});

test('ToolRuntime consecutive same-category calls are independent entries', () => {
  const message = { toolCalls: [] };
  const runtime = createToolRuntime({
    body: makeBody(),
    stillOwnsSlot: () => true,
    getMessage: () => message,
    onInlineTool() { return 0; },
    EventSource: null,
    mode: 'compact',
  });

  runtime.recordToolUse({ id: 'g1', name: 'web_search', input: { query: 'a' } });
  runtime.recordToolUse({ id: 'g2', name: 'web_search', input: { query: 'b' } });
  runtime.recordToolUse({ id: 'g3', name: 'code_interpreter' });

  assert.equal(message.toolCalls.length, 3);
  assert.equal(message.toolCalls[1]._groupHeadId, undefined, 'no merge metadata leaks onto the data');
  runtime.noteTextDelta();
  runtime.recordToolUse({ id: 'g4', name: 'web_search' });
  assert.equal(message.toolCalls.length, 4);
  runtime.dispose();
});

test('ToolRuntime settles each entry independently on terminal results', () => {
  const message = { toolCalls: [] };
  const runtime = createToolRuntime({
    body: makeBody(),
    stillOwnsSlot: () => true,
    getMessage: () => message,
    onInlineTool() { return 7; },
    EventSource: null,
    mode: 'compact',
  });

  runtime.recordToolUse({ id: 's1', name: 'web_search', input: { query: 'a' } });
  runtime.recordToolUse({ id: 's2', name: 'web_search', input: { query: 'b' } });
  runtime.recordToolResult({
    id: 's2', ok: true, status: 'completed', output: 'b',
    results: [{ title: 'B', url: 'https://b.test' }],
  });
  runtime.recordToolResult({ id: 'f1', ok: false, status: 'failed', output: 'boom' });

  const byId = Object.fromEntries(message.toolCalls.map((t) => [t.id, t]));
  assert.equal(byId.s2._run.phase, 'succeeded');
  assert.equal(byId.s2.results.length, 1);
  assert.equal(byId.f1._run.phase, 'failed');
  assert.equal(byId.f1.isError, true);
  assert.equal(byId.s1._run.phase, 'preparing', 'untouched entries keep running');
  runtime.dispose();
});

test('ToolRuntime cancel marks every open run cancelled on the data', () => {
  const message = { toolCalls: [] };
  const runtime = createToolRuntime({
    body: makeBody(),
    stillOwnsSlot: () => true,
    getMessage: () => message,
    onInlineTool() { return 0; },
    EventSource: null,
    mode: 'compact',
  });

  runtime.recordToolUse({ id: 'c1', name: 'web_search' });
  runtime.recordToolUse({ id: 'c2', name: 'web_search' });
  runtime.cancel();

  assert.equal(message.toolCalls[0]._run.phase, 'cancelled');
  assert.equal(message.toolCalls[1]._run.phase, 'cancelled');
  runtime.dispose();
});

/* ─── Codex agent steps (data only) ─────────────────────────────────── */

function agentRuntimeHarness() {
  const message = { toolCalls: [] };
  const runtime = createToolRuntime({
    body: makeBody(),
    stillOwnsSlot: () => true,
    getMessage: () => message,
    requestAnimationFrame(callback) { callback(); return 1; },
    cancelAnimationFrame() {},
    EventSource: null,
    mode: 'compact',
    onInlineTool() { return 0; },
  });
  return { message, runtime };
}

function stepFrame(overrides = {}) {
  return {
    type: 'step',
    id: 'agent-1',
    runId: 'run-1',
    stepId: 's1',
    kind: 'command',
    title: 'ran a command',
    detail: 'npm test',
    command: 'npm test',
    status: 'running',
    exitCode: null,
    durationMs: null,
    diffStat: null,
    output: null,
    ...overrides,
  };
}

test('agent steps persist on the tool call keyed by stepId', () => {
  const { message, runtime } = agentRuntimeHarness();
  runtime.recordToolUse({ id: 'agent-1', name: 'workspace_agent', input: { task: 'do it' } });
  runtime.recordAgentStep(stepFrame());
  runtime.recordAgentStep(stepFrame({ status: 'done', durationMs: 1500 }));
  runtime.recordAgentStep(stepFrame({ stepId: 's2', kind: 'read', command: 'cat a.ts', status: 'done' }));

  const entry = message.toolCalls.find((call) => call.id === 'agent-1');
  assert.equal(entry.runId, 'run-1');
  assert.deepEqual(entry.steps.map((step) => [step.stepId, step.status]), [['s1', 'done'], ['s2', 'done']]);
  assert.equal(entry.steps[0].durationMs, 1500);
  runtime.dispose();
});

test('agent plan frames update the persisted checklist in place', () => {
  const { message, runtime } = agentRuntimeHarness();
  runtime.recordToolUse({ id: 'agent-1', name: 'workspace_agent', input: {} });
  runtime.recordAgentPlan({
    type: 'plan', id: 'agent-1', runId: 'run-1',
    steps: [{ title: 'a', status: 'in_progress' }, { title: 'b', status: 'todo' }],
    explanation: 'why',
  });
  runtime.recordAgentPlan({
    type: 'plan', id: 'agent-1', runId: 'run-1',
    steps: [{ title: 'a', status: 'done' }, { title: 'b', status: 'in_progress' }],
  });
  const entry = message.toolCalls.find((call) => call.id === 'agent-1');
  assert.deepEqual(entry.plan.steps.map((step) => step.status), ['done', 'in_progress']);
  runtime.dispose();
});

test('agent frames that arrive before tool_use are replayed', () => {
  const { message, runtime } = agentRuntimeHarness();
  runtime.recordAgentStep(stepFrame({ id: '', stepId: 'early' }));
  assert.ok(message._orphanAgentFrames, 'the frame is buffered');

  runtime.recordToolUse({ id: 'agent-1', name: 'workspace_agent', input: {} });
  const entry = message.toolCalls.find((call) => call.id === 'agent-1');
  assert.equal(entry.steps.length, 1);
  assert.equal(entry.steps[0].stepId, 'early');
  runtime.dispose();
});

test('the agent result latches the terminal phase and duration on the data', () => {
  const { message, runtime } = agentRuntimeHarness();
  runtime.recordToolUse({ id: 'agent-1', name: 'workspace_agent', input: {} });
  runtime.recordAgentStep(stepFrame());
  runtime.recordToolResult({
    id: 'agent-1', name: 'workspace_agent', ok: true, status: 'completed',
    output: 'done', durationMs: 62_000,
  });
  const entry = message.toolCalls.find((call) => call.id === 'agent-1');
  assert.equal(entry._run.phase, 'succeeded');
  assert.equal(entry._run.durationMs, 62_000);
  runtime.dispose();
});

test('a failed agent run marks the entry failed on the data', () => {
  const { message, runtime } = agentRuntimeHarness();
  runtime.recordToolUse({ id: 'agent-1', name: 'workspace_agent', input: {} });
  runtime.recordAgentStep(stepFrame());
  runtime.recordToolResult({
    id: 'agent-1', name: 'workspace_agent', ok: false, status: 'failed', error: 'boom',
  });
  const entry = message.toolCalls.find((call) => call.id === 'agent-1');
  assert.equal(entry._run.phase, 'failed');
  assert.equal(entry.isError, true);
  runtime.dispose();
});

/* ── P_tool-declarative-refresh ──────────────────────────────────────
   The declarative renderer draws rows out of message.toolCalls, which this
   runtime mutates in place. Two consequences, both regression-pinned here:
   the data has to be complete at the moment it is chosen (not at finish()),
   and every mutation has to announce itself, because neither the message
   object nor the toolCalls array changes identity. */

function publishHarness(offset) {
  const events = [];
  globalThis.window.__socratesReactChatBridge = {
    publish: (event) => events.push(event),
  };
  const message = {
    clientId: 'msg-live-1',
    type: 'streaming',
    toolCalls: [],
  };
  let scheduled = null;
  const runtime = createToolRuntime({
    body: makeBody(),
    stillOwnsSlot: () => true,
    getMessage: () => message,
    onInlineTool: () => offset,
    requestAnimationFrame(callback) { scheduled = callback; return 3; },
    cancelAnimationFrame() {},
    EventSource: null,
    mode: 'compact',
  });
  return { message, events, runtime, flush: () => scheduled && scheduled() };
}

test('a live tool call carries its split point on the data, before finish()', () => {
  const h = publishHarness(7);
  try {
    h.runtime.recordToolUse({ id: 'tc-1', name: 'web_search', input: { query: 'q' } });
    assert.equal(h.message.toolCalls[0].textOffset, 7, 'offset stamped at mount time');
    assert.ok(h.events.some((e) => e.type === 'tool-run-updated' && e.messageId === 'msg-live-1'),
      'the mount is published — a row has to appear without waiting for the next text delta');
    assert.ok((h.message._toolRunRev || 0) >= 1, 'revision bumped');
    h.runtime.dispose();
  } finally {
    delete globalThis.window.__socratesReactChatBridge;
  }
});

test('streamed arguments land on the entry so a running row can preview them', () => {
  const h = publishHarness(0);
  try {
    h.runtime.recordToolUse({ id: 'tc-code', name: 'code_interpreter', input: null });
    h.runtime.recordToolCallDelta({ id: 'tc-code', index: 0, arguments: 'import antigravity' });
    h.flush();
    assert.equal(h.message.toolCalls[0].argumentsText, 'import antigravity');
    h.runtime.dispose();
  } finally {
    delete globalThis.window.__socratesReactChatBridge;
  }
});

test('a terminal result publishes, so the row stops spinning', () => {
  const h = publishHarness(3);
  try {
    h.runtime.recordToolUse({ id: 'tc-2', name: 'web_fetch', input: { url: 'https://arxiv.org/x' } });
    h.events.length = 0;
    h.runtime.recordToolResult({
      id: 'tc-2', name: 'web_fetch', ok: true, status: 'completed',
      output: 'Fetched', durationMs: 120,
    });
    const entry = h.message.toolCalls[0];
    assert.equal(entry._toolResultApplied, true);
    assert.ok(h.events.some((e) => e.type === 'tool-run-updated'), 'the settle is published');
    h.runtime.dispose();
  } finally {
    delete globalThis.window.__socratesReactChatBridge;
  }
});

test('cancelling a turn publishes the stopped state', () => {
  const h = publishHarness(3);
  try {
    h.runtime.recordToolUse({ id: 'tc-3', name: 'web_search', input: { query: 'q' } });
    h.events.length = 0;
    h.runtime.cancel();
    assert.ok(h.events.some((e) => e.type === 'tool-run-updated'), 'cancel repaints the rows');
    h.runtime.dispose();
  } finally {
    delete globalThis.window.__socratesReactChatBridge;
  }
});

/* P_tool-postfinish-approval — regression: main.js's finish() pins the
   runtime for a pending approval via dispose(), then applies the final
   html/rawText patch through session/update-message, whose reducer
   REPLACES the message object (`{ ...current, ...patch }`). activeMessage()
   must keep treating the swapped object as the same message (by
   clientId) or the approval POST is silently dropped. */
test('decideApproval still POSTs after dispose when the store swaps the message object', async () => {
  const runId = '11111111-1111-4111-8111-111111111111';
  const approvalId = '22222222-2222-4222-8222-222222222222';
  const pendingCall = {
    id: 'tc-codex-1',
    name: 'workspace_agent',
    approval: {
      id: 'tc-codex-1', runId, approvalId, status: 'pending',
      kind: 'commandExecution', reason: 'Run the verification command',
    },
  };

  let message = { clientId: 'msg-postfinish-1', id: 'msg-postfinish-1', toolCalls: [pendingCall] };
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
    if (String(url).includes('/approvals/')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, status: 'accepted' }) };
    }
    /* Run-status poll: report completed so the poll self-terminates. */
    return { ok: true, status: 200, text: async () => JSON.stringify({ run: { id: runId, status: 'completed' }, approvals: [] }) };
  };

  try {
    const runtime = createToolRuntime({
      body: makeBody(),
      stillOwnsSlot: () => true,
      getMessage: () => message,
      EventSource: null,
      mode: 'compact',
    });
    /* Finish the turn while an approval is pending: this pins
       postFinishApprovalMessage and keeps the runtime alive. */
    runtime.dispose();
    assert.equal(typeof runtime.decideApproval, 'function', 'runtime must stay actionable after dispose');

    /* The store then swaps the message object (same clientId, fresh
       object with the same pending approval) — exactly what the final
       session/update-message write-back does in main.js finish(). */
    message = { clientId: 'msg-postfinish-1', id: 'msg-postfinish-1', toolCalls: [{ ...pendingCall }] };

    await runtime.decideApproval('tc-codex-1', 'accept');

    const post = calls.find((c) => c.method === 'POST' && c.url.includes('/approvals/'));
    assert.ok(post, 'approval decision must be POSTed after finish');
    assert.equal(JSON.parse(post.body).decision, 'accept');
    assert.ok(post.url.includes(runId), 'POST uses the durable run id');
    assert.ok(post.url.includes(approvalId), 'POST uses the durable approval id');
    assert.equal(message.toolCalls[0].approval.status, 'accept', 'entry approval flips to accepted');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
