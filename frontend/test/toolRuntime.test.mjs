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

test('ToolRuntime drains progress that arrives before tool_use', () => {  const message = { toolCalls: [] };
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

test('ToolRuntime exposes whether any tool is still active', () => {
  const message = {
    toolCalls: [{ id: 'running', name: 'code_interpreter', output: null, isError: false }],
  };
  const runtime = createToolRuntime({
    body: { querySelector() { return null; }, querySelectorAll() { return []; } },
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

function makeLiveSlotDom() {
  const childNodes = [];
  const liveSlot = {
    childNodes,
    get firstElementChild() { return childNodes[0] || null; },
    get children() { return childNodes; },
    querySelector(sel) {
      if (sel !== '.tool-inline[data-tcid]') return null;
      for (let i = 0; i < childNodes.length; i++) {
        const n = childNodes[i];
        if (n && n.className === 'tool-inline' && n.dataset && n.dataset.tcid) return n;
      }
      return null;
    },
    appendChild(node) {
      // P_test_live_slot — the live slot moves children between mounts.
      // If a row is already in the slot (e.g. the runtime re-uses the
      // host for a same-id update), drop the prior reference first so
      // the post-conditions can detect duplicate mounts.
      if (node && node.parentNode && node.parentNode !== liveSlot) {
        const prev = node.parentNode;
        const idx = prev.childNodes ? prev.childNodes.indexOf(node) : -1;
        if (idx >= 0) prev.childNodes.splice(idx, 1);
      }
      const existing = childNodes.indexOf(node);
      if (existing >= 0) childNodes.splice(existing, 1);
      childNodes.push(node);
      if (node && typeof node === 'object') node.parentNode = liveSlot;
      return node;
    },
    removeChild(node) {
      const idx = childNodes.indexOf(node);
      if (idx >= 0) childNodes.splice(idx, 1);
      if (node && typeof node === 'object') node.parentNode = null;
      return node;
    },
  };
  return liveSlot;
}

// Body stub whose querySelector resolves `[data-tcid="…"]` into the live
// slot's rows, mirroring findCard() in toolRuntime.ts.
function makeLiveSlotBody(liveSlot) {
  return {
    childNodes: [liveSlot],
    querySelector(sel) {
      const m = /^\[data-tcid="([^"]+)"\]$/.exec(sel || '');
      if (!m) return null;
      for (let i = 0; i < liveSlot.childNodes.length; i++) {
        const n = liveSlot.childNodes[i];
        if (n && n.dataset && n.dataset.tcid === m[1]) return n;
      }
      return null;
    },
    querySelectorAll() { return []; },
  };
}

function installLiveSlotDocument() {
  globalThis.document = {
    createElement(tag) {
      const el = {
        tagName: tag, dataset: {}, className: '', innerHTML: '', textContent: '',
        parentNode: null,
        _isConnected: false,
        get isConnected() { return this._isConnected || !!(this.parentNode); },
        getAnimations() { return []; },
        querySelector() { return null; },
        getAttribute(name) {
          return name === 'data-tcid' ? (this.dataset.tcid || null) : (this.dataset[name] || null);
        },
        hasAttribute(name) {
          return name in this.dataset;
        },
        setAttribute(name, value) { this.dataset[name] = String(value); },
        insertAdjacentElement() { return null; },
        addEventListener() {},
        removeEventListener() {},
        appendChild(child) {
          if (child && typeof child === 'object') child.parentNode = el;
          return child;
        },
        remove() {
          if (this.parentNode && Array.isArray(this.parentNode.childNodes)) {
            const idx = this.parentNode.childNodes.indexOf(this);
            if (idx >= 0) this.parentNode.childNodes.splice(idx, 1);
          }
          this.parentNode = null;
        },
        replaceChildren() {},
      };
      // classList mirrors className so classList.contains('tool-inline')
      // behaves like a real DOM element (toolInline rows set className).
      el.classList = {
        add(c) { el.className = (el.className + ' ' + c).trim(); },
        remove(c) { el.className = el.className.split(' ').filter((x) => x !== c).join(' '); },
        contains(c) { return el.className.split(' ').indexOf(c) !== -1; },
      };
      return el;
    },
  };
}

test('ToolRuntime live single-card slot shows only the latest tool, persists all toolCalls', () => {
  const message = { toolCalls: [] };
  const liveSlot = makeLiveSlotDom();
  installLiveSlotDocument();
  try {
    const runtime = createToolRuntime({
      body: { childNodes: [liveSlot], querySelector() { return null; }, querySelectorAll() { return []; } },
      stillOwnsSlot: () => true,
      getMessage: () => message,
      liveSingleCardSlot: liveSlot,
      onInlineTool() { return 10; },
      EventSource: null,
      mode: 'compact',
    });

    runtime.recordToolUse({ id: 'A', name: 'web_search', input: { q: 1 } });
    runtime.recordToolUse({ id: 'B', name: 'code_interpreter', input: { q: 2 } });
    runtime.recordToolUse({ id: 'C', name: 'web_search', input: { q: 3 } });

    return new Promise((resolve) => setTimeout(() => {
      const liveRows = liveSlot.childNodes.filter((n) => n && n.dataset && n.dataset.tcid);
      assert.equal(liveRows.length, 1, 'live slot must hold at most one tool row');
      assert.equal(liveRows[0].dataset.tcid, 'C');
      assert.deepEqual(message.toolCalls.map((t) => t.id), ['A', 'B', 'C']);
      runtime.dispose();
      resolve();
    }, 320));
  } finally {
    delete globalThis.document;
  }
});

test('ToolRuntime live single-card slot updates same id in place without re-flashing', () => {
  const message = { toolCalls: [] };
  const liveSlot = makeLiveSlotDom();
  installLiveSlotDocument();
  try {
    const runtime = createToolRuntime({
      body: { childNodes: [liveSlot], querySelector() { return null; }, querySelectorAll() { return []; } },
      stillOwnsSlot: () => true,
      getMessage: () => message,
      liveSingleCardSlot: liveSlot,
      onInlineTool() { return 5; },
      EventSource: null,
      mode: 'compact',
    });
    runtime.recordToolUse({ id: 'A', name: 'web_search', input: { q: 1 } });
    const first = liveSlot.childNodes[0];
    runtime.recordToolUse({ id: 'A', name: 'web_search', input: { q: 2 } });
    const liveRows = liveSlot.childNodes.filter((n) => n && n.dataset && n.dataset.tcid);
    assert.equal(liveRows.length, 1, 'same-id update must not mount a second row');
    assert.strictEqual(liveRows[0], first, 'same-id update must keep the existing row');
    assert.equal(message.toolCalls[0].input.q, 2);
    assert.equal(message.toolCalls.length, 1, 'same-id events must not duplicate the entry');
    runtime.dispose();
  } finally {
    delete globalThis.document;
  }
});

test('ToolRuntime dispose tears down the live single-card slot cleanly', () => {
  const message = { toolCalls: [{ id: 'A', name: 'web_search', artifacts: [] }] };
  const liveSlot = makeLiveSlotDom();
  installLiveSlotDocument();
  try {
    const runtime = createToolRuntime({
      body: { childNodes: [liveSlot], querySelector() { return null; }, querySelectorAll() { return []; } },
      stillOwnsSlot: () => true,
      getMessage: () => message,
      liveSingleCardSlot: liveSlot,
      onInlineTool() { return 0; },
      EventSource: null,
      mode: 'compact',
    });
    runtime.recordToolResult({ id: 'A', name: 'web_search', ok: true, status: 'completed', output: 'ok' });
    runtime.dispose();
    // After dispose, no new mount should occur even if a late event
    // tries to drive the runtime.
    runtime.recordToolUse({ id: 'B', name: 'web_search' });
    assert.equal(message.toolCalls.length, 1, 'dispose must prevent late mounts');
  } finally {
    delete globalThis.document;
  }
});

test('ToolRuntime collapses consecutive same-category live rows into a group', () => {
  const message = { toolCalls: [] };
  const liveSlot = makeLiveSlotDom();
  installLiveSlotDocument();
  try {
    const runtime = createToolRuntime({
      body: { childNodes: [liveSlot], querySelector() { return null; }, querySelectorAll() { return []; } },
      stillOwnsSlot: () => true,
      getMessage: () => message,
      liveSingleCardSlot: liveSlot,
      onInlineTool() { return 0; },
      EventSource: null,
      mode: 'compact',
    });

    runtime.recordToolUse({ id: 'g1', name: 'web_search', input: { query: 'a' } });
    runtime.recordToolUse({ id: 'g2', name: 'web_search', input: { query: 'b' } });

    assert.equal(message.toolCalls.length, 2);
    const row1 = liveSlot.childNodes.find((r) => r && r.dataset.tcid === 'g1');
    const row2 = liveSlot.childNodes.find((r) => r && r.dataset.tcid === 'g2');
    assert.ok(row1 && row2, 'both rows must exist in the slot');
    assert.equal(row2.dataset.merged, '1', 'second same-category row is merged/hidden');
    assert.equal(row1.dataset.groupCount, '2', 'visible row shows the group count');
    runtime.dispose();
  } finally {
    delete globalThis.document;
  }
});

test('ToolRuntime resets grouping on a category change', () => {
  const message = { toolCalls: [] };
  const liveSlot = makeLiveSlotDom();
  installLiveSlotDocument();
  try {
    const runtime = createToolRuntime({
      body: { childNodes: [liveSlot], querySelector() { return null; }, querySelectorAll() { return []; } },
      stillOwnsSlot: () => true,
      getMessage: () => message,
      liveSingleCardSlot: liveSlot,
      onInlineTool() { return 0; },
      EventSource: null,
      mode: 'compact',
    });

    runtime.recordToolUse({ id: 'h1', name: 'web_search' });
    runtime.recordToolUse({ id: 'h2', name: 'web_search' }); // merged
    runtime.recordToolUse({ id: 'h3', name: 'code_interpreter' }); // different category

    const row3 = liveSlot.childNodes.find((r) => r && r.dataset.tcid === 'h3');
    assert.ok(row3, 'third row mounted');
    assert.equal(row3.dataset.merged, undefined, 'category change must not merge');
    assert.equal(row3.dataset.groupCount, undefined);
    runtime.dispose();
  } finally {
    delete globalThis.document;
  }
});

test('ToolRuntime expands a merged row when it settles', () => {
  const message = { toolCalls: [] };
  const liveSlot = makeLiveSlotDom();
  installLiveSlotDocument();
  try {
    const runtime = createToolRuntime({
      body: makeLiveSlotBody(liveSlot),
      stillOwnsSlot: () => true,
      getMessage: () => message,
      liveSingleCardSlot: liveSlot,
      onInlineTool() { return 0; },
      EventSource: null,
      mode: 'compact',
    });

    runtime.recordToolUse({ id: 's1', name: 'web_search', input: { query: 'a' } });
    runtime.recordToolUse({ id: 's2', name: 'web_search', input: { query: 'b' } });
    runtime.recordToolResult({ id: 's2', ok: true, status: 'completed', output: 'second result' });

    const row2 = liveSlot.childNodes.find((r) => r && r.dataset.tcid === 's2');
    assert.ok(row2, 'merged row must exist');
    assert.equal(row2.dataset.merged, undefined, 'settled row is expanded (unhidden)');
    assert.equal(row2.dataset.state, 'done');
    // The settled member replaces the collapsed head as the visible row.
    assert.equal(liveSlot.childNodes[liveSlot.childNodes.length - 1], row2);
    runtime.dispose();
  } finally {
    delete globalThis.document;
  }
});

/* ─── Message-flow grouping (no live slot) ─────────────────────────── */

function makeInlineFlowBody(rows) {
  return {
    querySelector(sel) {
      const m = /^\[data-tcid="([^"]+)"\]$/.exec(sel || '');
      if (!m) return null;
      return rows.find((r) => r && r.dataset && r.dataset.tcid === m[1]) || null;
    },
    querySelectorAll() { return rows; },
    appendChild() {},
  };
}

test('ToolRuntime merges consecutive same-category rows in the message flow', () => {
  const message = { toolCalls: [] };
  const rows = [];
  installLiveSlotDocument();
  try {
    const runtime = createToolRuntime({
      body: makeInlineFlowBody(rows),
      stillOwnsSlot: () => true,
      getMessage: () => message,
      onInlineTool(entry, row) {
        rows.push(row);
        row._isConnected = true;
        return 10;
      },
      EventSource: null,
      mode: 'compact',
    });

    runtime.recordToolUse({ id: 'g1', name: 'web_search', input: { query: 'a' } });
    runtime.recordToolUse({ id: 'g2', name: 'web_search', input: { query: 'b' } });
    runtime.recordToolUse({ id: 'g3', name: 'code_interpreter' });

    assert.equal(rows.length, 2, 'same-category merge must not mount a second row');
    const head = rows[0];
    assert.equal(head.dataset.groupIds, 'g1,g2');
    assert.equal(head.dataset.groupCount, '2');
    assert.equal(message.toolCalls[1]._groupHeadId, 'g1');
    assert.equal(message.toolCalls[1].textOffset, 10, 'merged member inherits head offset');
    assert.equal(rows[1].dataset.tcid, 'g3', 'different category starts a new row');
    runtime.dispose();
  } finally {
    delete globalThis.document;
  }
});

test('ToolRuntime breaks live grouping when text streams after a row', () => {
  const message = { toolCalls: [] };
  const rows = [];
  installLiveSlotDocument();
  try {
    const runtime = createToolRuntime({
      body: makeInlineFlowBody(rows),
      stillOwnsSlot: () => true,
      getMessage: () => message,
      onInlineTool(entry, row) {
        rows.push(row);
        row._isConnected = true;
        return 3;
      },
      EventSource: null,
      mode: 'compact',
    });

    runtime.recordToolUse({ id: 't1', name: 'web_search' });
    runtime.noteTextDelta();
    runtime.recordToolUse({ id: 't2', name: 'web_search' });

    assert.equal(rows.length, 2, 'text delta must break the merge group');
    assert.equal(message.toolCalls[1]._groupHeadId, undefined);
    assert.equal(rows[1].dataset.groupIds, undefined);
    runtime.dispose();
  } finally {
    delete globalThis.document;
  }
});

test('ToolRuntime settles a grouped row with aggregate done state', () => {
  const message = { toolCalls: [] };
  const rows = [];
  installLiveSlotDocument();
  try {
    const runtime = createToolRuntime({
      body: makeInlineFlowBody(rows),
      stillOwnsSlot: () => true,
      getMessage: () => message,
      onInlineTool(entry, row) {
        rows.push(row);
        row._isConnected = true;
        return 7;
      },
      EventSource: null,
      mode: 'compact',
    });

    runtime.recordToolUse({ id: 's1', name: 'web_search', input: { query: 'a' } });
    runtime.recordToolUse({ id: 's2', name: 'web_search', input: { query: 'b' } });
    runtime.recordToolResult({
      id: 's2', ok: true, status: 'completed', output: 'b',
      results: [{ title: 'B', url: 'https://b.test' }],
    });
    runtime.recordToolResult({
      id: 's1', ok: true, status: 'completed', output: 'a',
      results: [{ title: 'A', url: 'https://a.test' }],
    });

    const head = rows[0];
    assert.equal(head.dataset.state, 'done');
    assert.equal(head.dataset.groupSettled, '1');
    assert.equal(message.toolCalls.length, 2, 'both members stay persisted');
    runtime.dispose();
  } finally {
    delete globalThis.document;
  }
});

test('ToolRuntime marks a grouped row as error when a member fails', () => {
  const message = { toolCalls: [] };
  const rows = [];
  installLiveSlotDocument();
  try {
    const runtime = createToolRuntime({
      body: makeInlineFlowBody(rows),
      stillOwnsSlot: () => true,
      getMessage: () => message,
      onInlineTool(entry, row) {
        rows.push(row);
        row._isConnected = true;
        return 4;
      },
      EventSource: null,
      mode: 'compact',
    });

    runtime.recordToolUse({ id: 'f1', name: 'web_search' });
    runtime.recordToolUse({ id: 'f2', name: 'web_search' });
    runtime.recordToolResult({ id: 'f2', ok: true, status: 'completed', output: 'ok' });
    runtime.recordToolResult({ id: 'f1', ok: false, status: 'failed', output: 'boom' });

    const head = rows[0];
    assert.equal(head.dataset.state, 'error');
    assert.equal(head.dataset.groupSettled, '1');
    runtime.dispose();
  } finally {
    delete globalThis.document;
  }
});

test('ToolRuntime cancel settles grouped rows as stopped', () => {
  const message = { toolCalls: [] };
  const rows = [];
  installLiveSlotDocument();
  try {
    const runtime = createToolRuntime({
      body: makeInlineFlowBody(rows),
      stillOwnsSlot: () => true,
      getMessage: () => message,
      onInlineTool(entry, row) {
        rows.push(row);
        row._isConnected = true;
        return 0;
      },
      EventSource: null,
      mode: 'compact',
    });

    runtime.recordToolUse({ id: 'c1', name: 'web_search' });
    runtime.recordToolUse({ id: 'c2', name: 'web_search' });
    runtime.cancel();

    const head = rows[0];
    assert.equal(head.dataset.state, 'stopped');
    assert.equal(head.dataset.groupSettled, '1');
    runtime.dispose();
  } finally {
    delete globalThis.document;
  }
});
