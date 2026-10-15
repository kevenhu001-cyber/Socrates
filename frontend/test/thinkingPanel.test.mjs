import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveTurnPresentationState, normalizePublicTurnActivity } from '../src/ui/turnActivityModel.ts';

const live = { type: 'streaming', role: 'assistant', reasoningContent: 'private scratch work' };
test('private reasoning and legacy task previews never become public copy', () => {
  const view = deriveTurnPresentationState({ ...live, _taskSummary: 'Regex guessed topic' });
  assert.equal(view.publicSummary, '');
  assert.equal(view.status, undefined);
});
test('running tools own activity even if reasoning arrives or a summary exists', () => {
  const view = deriveTurnPresentationState({ ...live, summary: 'Analysis complete', _activity: { type: 'thinking' }, _liveStatus: { phase: 'thinking', label: 'Thinking' } }, { hasRunningRow: true });
  assert.equal(view.status, undefined);
  assert.equal(view.publicSummary, '');
  assert.equal(view.showCursor, false);
});
test('deferred tools keep a single visible action until their row mounts', () => {
  const message = { ...live, _activity: { type: 'tool', toolCallId: 'search', toolName: 'web_search' }, _liveStatus: { phase: 'tool-running', label: 'Searching', toolName: 'web_search' } };
  assert.equal(deriveTurnPresentationState(message).status.phase, 'tool-running');
  assert.equal(deriveTurnPresentationState(message, { hasRunningRow: true }).status, undefined);
});
test('done activity waits for playback settlement before enabling actions', () => {
  const message = { ...live, _activity: { type: 'done', durationMs: 1200 } };
  assert.equal(deriveTurnPresentationState(message).showToolbar, false);
  assert.equal(deriveTurnPresentationState({ ...message, _streamSettled: true }).showToolbar, true);
});
test('retry and terminal failures remain visible over running tool rows', () => {
  for (const phase of ['retrying', 'error', 'stopped']) {
    assert.equal(deriveTurnPresentationState({ ...live, _liveStatus: { phase, label: phase } }, { hasRunningRow: true }).status.phase, phase);
  }
});
test('only explicit public summary events may provide reasoning summary copy', () => {
  assert.equal(normalizePublicTurnActivity({ type: 'reasoning', text: 'private' }), null);
  const view = deriveTurnPresentationState({ ...live, _activity: { type: 'public_reasoning_summary', text: ' Checked sources. ' } });
  assert.equal(view.status.label, 'Checked sources.');
});

test('synthesizing is observable before prose and retires when prose begins', () => {
  const message = { ...live, _activity: { type: 'synthesizing' } };
  assert.equal(deriveTurnPresentationState(message).status.phase, 'synthesizing');
  assert.equal(deriveTurnPresentationState({ ...message, rawText: 'Answer.' }).status, undefined);
});

test('an earlier completed tool cannot hide the next deferred tool activity', () => {
  const message = { ...live, toolCalls: [{ id: 'old', name: 'Read', status: 'completed', output: 'Read file.' }], _activity: { type: 'tool', toolCallId: 'new', toolName: 'web_search' } };
  assert.equal(deriveTurnPresentationState(message, { hasSettledTool: true }).status.phase, 'tool-running');
  assert.equal(deriveTurnPresentationState({ ...message, toolCalls: [...message.toolCalls, { id: 'new', name: 'web_search', status: 'completed', output: '' }] }, { hasSettledTool: true }).status, undefined);
});


test('startup thinking activity remains waiting until provider reasoning is observed', () => {
  const waiting = { type: 'streaming', _activity: { type: 'thinking' }, _liveStatus: { phase: 'waiting', label: 'Waiting', elapsedSec: 5 } };
  const status = deriveTurnPresentationState(waiting).status;
  assert.equal(status.phase, 'waiting');
  assert.equal(status.elapsedSec, 5);
  assert.match(status.label, /Waiting/);
  const thinking = deriveTurnPresentationState({ ...waiting, reasoningContent: 'private', _liveStatus: { phase: 'thinking', label: 'Thinking', elapsedSec: 1 } }).status;
  assert.equal(thinking.phase, 'thinking');
  assert.equal(thinking.elapsedSec, 1);
  assert.match(thinking.label, /Thinking/);
  assert.equal(deriveTurnPresentationState({ ...waiting, rawText: 'Answer.' }).status, undefined);
});
