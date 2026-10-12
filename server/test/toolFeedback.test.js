import assert from 'node:assert/strict';
import test from 'node:test';

import { formatToolResultContent } from '../src/routes/chat/pipeline/toolFeedback.js';

test('image artifact feedback offers an optional fixed markdown reference', () => {
  const content = formatToolResultContent('code_interpreter', {
    status: 'completed',
    exitCode: 0,
    durationMs: 12,
    artifactFileIds: [{ id: 'file-123', name: 'plot.png', mimeType: 'image/png' }],
    stdout: 'plot saved',
  });

  assert.match(content, /\[id:file-123\]/);
  assert.match(content, /NOT rendered automatically/);
  assert.match(content, /only when it materially helps/i);
  assert.match(content, /!\[short description\]\(\/api\/files\/<fileId>\/raw\)/);
});

test('non-image artifacts do not prompt the model to cite an image', () => {
  const content = formatToolResultContent('code_interpreter', {
    status: 'completed',
    exitCode: 0,
    durationMs: 12,
    artifactFileIds: [{ id: 'file-csv', name: 'data.csv', mimeType: 'text/csv' }],
    stdout: 'table saved',
  });

  assert.doesNotMatch(content, /NOT rendered automatically/);
});

test('code interpreter failures preserve remediation details and stderr tail', () => {
  const content = formatToolResultContent('code_interpreter', {
    status: 'failed',
    errorCode: 'execution_timeout',
    retryable: false,
    errorMessage: 'execution timed out',
    stderr: Array.from({ length: 21 }, (_, index) => `line ${index}`).join('\n'),
    artifactFileIds: [{ name: 'trace.txt' }],
  });

  assert.match(content, /\[error_code: execution_timeout\]/);
  assert.match(content, /\[retryable: no\]/);
  assert.match(content, /STOP retrying this exact code/);
  assert.match(content, /earlier stderr lines truncated/);
  assert.match(content, /line 20/);
});

test('visualization, plan and spec feedback covers success and correction paths', () => {
  const visual = formatToolResultContent('render_visualization', {
    status: 'completed',
    visualization: { template: 'bar', title: 'Scores' },
  });
  assert.match(visual, /visual card is now rendered/);

  const visualFailure = formatToolResultContent('render_visualization', {
    status: 'failed',
    errorCode: 'visual_spec_invalid',
    retryable: false,
  });
  assert.match(visualFailure, /Explain the issue concisely/);

  const plan = formatToolResultContent('create_plan', { status: 'completed', output: 'plan body' });
  assert.match(plan, /\[plan card rendered\]/);
  const spec = formatToolResultContent('create_spec', { status: 'completed', output: 'spec body' });
  assert.match(spec, /\[spec card rendered\]/);

  const correction = formatToolResultContent('create_plan', {
    status: 'failed',
    errorCode: 'plan_spec_invalid',
    retryable: true,
    correction: 'fix the steps',
  });
  assert.equal(correction, 'fix the steps');
  const fallback = formatToolResultContent('create_spec', {
    status: 'failed',
    errorCode: 'spec_spec_invalid',
    retryable: false,
    detail: ['title is required'],
  });
  assert.match(fallback, /\[field_errors:/);
});

test('workspace, search, fetch and connector failures explain the next action', () => {
  const workspace = formatToolResultContent('workspace_agent', {
    status: 'completed',
    runId: 'run-1',
    workspaceId: 'ws-1',
    output: 'changed files',
  });
  assert.match(workspace, /workspace run is rendered inline/);
  const workspaceFailure = formatToolResultContent('workspace_agent', {
    status: 'failed',
    runId: 'run-2',
    errorCode: 'agent_failed',
    error: 'runner stopped',
  });
  assert.match(workspaceFailure, /Do not start a duplicate run/);

  const search = formatToolResultContent('web_search', {
    status: 'failed',
    errorCode: 'rate_limited',
    retryable: false,
    detail: 'try later',
  });
  assert.match(search, /answer from your own knowledge/);

  for (const [errorCode, expected] of [
    ['offset_out_of_range', /previous next_offset/],
    ['page_cache_miss', /fresh page snapshot/],
    ['invalid_paging_arguments', /max_chars from 1 to 30000/],
    ['network_failed', /web_search and rely on the snippets/],
  ]) {
    const fetch = formatToolResultContent('web_fetch', { status: 'failed', errorCode, detail: 'details' });
    assert.match(fetch, expected);
  }

  const connector = formatToolResultContent('arxiv_search', {
    status: 'failed',
    errorCode: 'provider_down',
    retryable: true,
    detail: 'unavailable',
  });
  assert.match(connector, /Do not fabricate results/);
});

test('generic correction and terminal results retain their original payload', () => {
  assert.equal(formatToolResultContent('some_tool', { correction: 'schema feedback' }), 'schema feedback');
  assert.equal(formatToolResultContent('some_tool', { status: 'completed', output: 'result' }), 'result');
  assert.equal(formatToolResultContent('some_tool', { status: 'failed', error: 'failed' }), '[error] failed');
});
