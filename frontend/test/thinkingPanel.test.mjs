import assert from 'node:assert/strict';
import test from 'node:test';
import { turnSummaryOf } from '../src/react/tool-run/turnSummary.ts';

test('plain answers do not add activity chrome or repeat answer text', () => {
  const view = turnSummaryOf({ role: 'assistant', rawText: 'The answer.' }, false);
  assert.equal(view.hasWork, false);
  assert.ok(!view.summary.includes('The answer.'));
});

test('reasoning creates a factual summary without revealing its content', () => {
  const view = turnSummaryOf({ role: 'assistant', rawText: '<think>private inline</think>Answer.', reasoningContent: 'private reasoning' }, false);
  assert.equal(view.hasWork, true);
  assert.equal(view.label, 'Thought complete');
  assert.equal(view.summary, 'Thinking complete.');
  assert.ok(!JSON.stringify(view).includes('private'));
});

test('model summary stays in details rather than the short heading', () => {
  const view = turnSummaryOf({ role: 'assistant', summary: '  Checked sources and compared the findings.  ' }, false);
  assert.equal(view.label, 'Process');
  assert.equal(view.summary, 'Checked sources and compared the findings.');
});

test('live and persisted calls produce the same activity facts', () => {
  const call = { id: 'search', name: 'web_search', input: { query: 'public query' } };
  const message = { role: 'assistant', toolCalls: [call], _liveStatus: { phase: 'tool-running', label: 'Searching' } };
  const running = turnSummaryOf(message, true);
  assert.equal(running.activities[0].state, 'running');
  const settled = turnSummaryOf({ ...message, toolCalls: [{ ...call, output: 'Found a source', status: 'completed', isError: false }] }, false);
  assert.equal(settled.activities[0].state, 'done');
  assert.equal(settled.activities[0].id, running.activities[0].id);
  assert.equal(settled.summary, 'Tools used: 1.');
});

test('summaries stay scoped to their own messages and preserve failure states', () => {
  const failed = turnSummaryOf({ role: 'assistant', toolCalls: [{ id: 'bad', name: 'web_search', isError: true, error: 'Timeout', status: 'failed' }] }, false);
  assert.equal(failed.activities[0].state, 'error');
  const other = turnSummaryOf({ role: 'assistant', summary: 'Other turn.' }, false);
  assert.deepEqual(other.activities, []);
  assert.equal(other.summary, 'Other turn.');
});

test('waiting and retrying have a disclosure before reasoning arrives', () => {
  for (const phase of ['waiting', 'retrying']) {
    const view = turnSummaryOf({ role: 'assistant', _liveStatus: { phase, label: 'Working' } }, true);
    assert.equal(view.hasWork, true);
    assert.equal(view.summary, 'Waiting for the response.');
  }
});
