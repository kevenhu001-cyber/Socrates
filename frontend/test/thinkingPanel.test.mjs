import assert from 'node:assert/strict';
import test from 'node:test';

import {
  installThinkingPanelBridge,
} from '../src/react/thinking-panel/thinkingPanel.bridge.ts';
import { buildSummaryHistory } from '../src/react/thinking-panel/summaryHistory.ts';

/* The store targets the browser, but every window access happens inside
   functions (install / publish), so pointing window at the Node global
   keeps the module testable without a DOM. */
globalThis.window = globalThis;

const bridge = installThinkingPanelBridge();

function reset() {
  bridge.publish({ type: 'turn-start' });
}

test('ThinkingPanel bridge installs once and starts closed', () => {
  const first = installThinkingPanelBridge();
  const second = installThinkingPanelBridge();
  assert.strictEqual(first, second, 'install must be idempotent');
  assert.equal(window.__socratesThinkingPanelBridge, first);
  assert.deepEqual(
    {
      open: first.getSnapshot().open,
      messageId: first.getSnapshot().messageId,
      activities: first.getSnapshot().activities,
      streaming: first.getSnapshot().streaming,
    },
    { open: false, messageId: null, activities: [], streaming: false },
  );
});

test('ThinkingPanel stores summarized tool activity without reasoning text', () => {
  reset();
  bridge.publish({ type: 'thinking-start', messageId: 'msg-1' });
  bridge.publish({ type: 'panel-open', messageId: 'msg-1' });
  bridge.publish({
    type: 'tool-activity',
    messageId: 'msg-1',
    id: 'search-1',
    name: 'web_search',
    input: { query: '2026 Nobel Prize in Physics' },
    state: 'running',
  });

  const snapshot = bridge.getSnapshot();
  assert.equal(snapshot.open, true);
  assert.equal(snapshot.messageId, 'msg-1');
  assert.equal(snapshot.streaming, false, 'the tool owns the active timeline row');
  assert.equal(snapshot.activities.length, 1);
  assert.equal(snapshot.activities[0].id, 'search-1');
  assert.equal(snapshot.activities[0].toolName, 'web_search');
  assert.match(snapshot.activities[0].label, /2026 Nobel Prize in Physics/);
  assert.equal(snapshot.activities[0].state, 'running');
  assert.deepEqual(Object.keys(snapshot.activities[0]).sort(), ['id', 'label', 'state', 'toolName']);
  assert.equal('text' in snapshot, false, 'the snapshot must not carry chain-of-thought text');
});

test('ThinkingPanel updates a tool summary when execution completes', () => {
  reset();
  bridge.publish({ type: 'thinking-start', messageId: 'msg-2' });
  bridge.publish({
    type: 'tool-activity',
    messageId: 'msg-2',
    id: 'search-2',
    name: 'web_search',
    input: { query: 'Nobel Prize predictions' },
    results: [{ title: 'Prediction' }],
    state: 'done',
  });

  const snapshot = bridge.getSnapshot();
  assert.equal(snapshot.streaming, true, 'the model resumes after a tool result');
  assert.equal(snapshot.activities.length, 1, 'completion updates rather than duplicates the row');
  assert.match(snapshot.activities[0].label, /Nobel Prize predictions/);
  assert.equal(snapshot.activities[0].state, 'done');
});

test('ThinkingPanel keeps the summary after thinking-end', () => {
  reset();
  bridge.publish({ type: 'thinking-start', messageId: 'msg-3' });
  bridge.publish({ type: 'panel-open', messageId: 'msg-3' });
  bridge.publish({
    type: 'tool-activity',
    messageId: 'msg-3',
    id: 'fetch-3',
    name: 'web_fetch',
    input: { url: 'https://example.test/article' },
    state: 'done',
  });
  bridge.publish({ type: 'thinking-end', messageId: 'msg-3' });

  const snapshot = bridge.getSnapshot();
  assert.equal(snapshot.streaming, false);
  assert.equal(snapshot.activities.length, 1);
  assert.equal(snapshot.activities[0].state, 'done');
  assert.equal(snapshot.open, true);
});

test('ThinkingPanel turn-start closes and resets the snapshot', () => {
  reset();
  bridge.publish({ type: 'thinking-start', messageId: 'msg-4' });
  bridge.publish({ type: 'panel-open', messageId: 'msg-4' });
  bridge.publish({
    type: 'tool-activity', messageId: 'msg-4', id: 'old-tool', name: 'web_search',
    input: { query: 'old turn' }, state: 'running',
  });
  bridge.publish({ type: 'turn-start' });

  const snapshot = bridge.getSnapshot();
  assert.equal(snapshot.open, false);
  assert.equal(snapshot.messageId, null);
  assert.deepEqual(snapshot.activities, []);
  assert.equal(snapshot.streaming, false);
});

test('ThinkingPanel panel-close keeps activity summaries for reopening', () => {
  reset();
  bridge.publish({ type: 'thinking-start', messageId: 'msg-5' });
  bridge.publish({
    type: 'tool-activity', messageId: 'msg-5', id: 'tool-5', name: 'web_search',
    input: { query: 'buffered activity' }, state: 'done',
  });
  bridge.publish({ type: 'panel-close' });

  const closed = bridge.getSnapshot();
  assert.equal(closed.open, false);
  assert.equal(closed.activities.length, 1);
  assert.match(closed.activities[0].label, /buffered activity/);

  bridge.publish({ type: 'panel-open', messageId: 'msg-5' });
  assert.equal(bridge.getSnapshot().open, true);
  assert.equal(bridge.getSnapshot().activities.length, 1);
});

test('ThinkingPanel ignores stale tool activity for a different message id', () => {
  reset();
  bridge.publish({ type: 'thinking-start', messageId: 'current' });
  bridge.publish({
    type: 'tool-activity', messageId: 'current', id: 'current-tool', name: 'web_search',
    input: { query: 'current' }, state: 'running',
  });
  const before = bridge.getSnapshot();
  bridge.publish({
    type: 'tool-activity', messageId: 'stale', id: 'stale-tool', name: 'web_search',
    input: { query: 'stale' }, state: 'done',
  });

  assert.strictEqual(bridge.getSnapshot(), before);
  assert.equal(bridge.getSnapshot().messageId, 'current');
  assert.equal(bridge.getSnapshot().activities.length, 1);
});

test('summary history reconstructs every assistant turn without exposing reasoning', () => {
  const history = buildSummaryHistory([
    { clientId: 'user-1', role: 'user', rawText: 'First question' },
    {
      clientId: 'assistant-1',
      role: 'assistant',
      rawText: '<think>private inline thought</think>First answer is ready.',
      reasoningContent: 'private reasoning field',
      toolCalls: [{ id: 'search-1', name: 'web_search', input: { query: 'first query' }, status: 'done', output: 'ok' }],
    },
    { clientId: 'user-2', role: 'user', rawText: 'Second question' },
    {
      clientId: 'assistant-2',
      role: 'assistant',
      type: 'streaming',
      rawText: 'Second answer is arriving.',
      toolCalls: [],
    },
  ], {
    open: true,
    messageId: 'assistant-2',
    activities: [{ id: 'live-search', toolName: 'web_search', label: 'Searching "second query"…', state: 'running' }],
    streaming: true,
    revision: 1,
    lastEvent: 'tool-activity',
  });

  assert.equal(history.length, 2);
  assert.equal(history[0].question, 'First question');
  assert.match(history[0].answerPreview, /First answer is ready/);
  assert.doesNotMatch(history[0].answerPreview, /private/);
  assert.match(history[0].activities[0].label, /first query/);
  assert.equal(history[1].question, 'Second question');
  assert.equal(history[1].streaming, true);
  assert.match(history[1].activities[0].label, /second query/);
});
