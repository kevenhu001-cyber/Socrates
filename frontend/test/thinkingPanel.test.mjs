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

test('public summary remains separate from the factual thinking status', () => {
  const view = turnSummaryOf({ role: 'assistant', summary: '  Checked sources and compared the findings.  ' }, false);
  assert.equal(view.label, 'Process');
  assert.equal(view.summary, 'Checked sources and compared the findings.');
});

test('tool-only turns leave execution facts to the tool rows', () => {
  const call = { id: 'search', name: 'web_search', input: { query: 'public query' } };
  const message = { role: 'assistant', toolCalls: [call], _liveStatus: { phase: 'tool-running', label: 'Searching' } };
  const running = turnSummaryOf(message, true);
  assert.equal(running.hasWork, true);
  const settled = turnSummaryOf({ ...message, toolCalls: [{ ...call, output: 'Found a source', status: 'completed', isError: false }] }, false);
  assert.equal(settled.hasWork, false);
  assert.equal('activities' in settled, false);
});

test('task previews cannot become completed activity summaries', () => {
  const preview = { role: 'assistant', _taskSummary: 'Preparing a comparison.', _liveStatus: { phase: 'waiting', label: 'Working' } };
  assert.equal(turnSummaryOf(preview, true).summary, 'Preparing a comparison.');
  assert.equal(turnSummaryOf(preview, false).hasWork, false);
  const other = turnSummaryOf({ role: 'assistant', summary: 'Other turn.' }, false);
  assert.equal(other.summary, 'Other turn.');
  assert.equal(turnSummaryOf({ ...preview, summary: 'Compared the sources.' }, false).summary, 'Compared the sources.');
});

test('waiting and retrying provide status before reasoning arrives', () => {
  for (const phase of ['waiting', 'retrying']) {
    const view = turnSummaryOf({ role: 'assistant', _liveStatus: { phase, label: 'Working' } }, true);
    assert.equal(view.hasWork, true);
    assert.equal(view.summary, 'Waiting for the response.');
  }
});
