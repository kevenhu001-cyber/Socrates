import assert from 'node:assert/strict';
import test from 'node:test';

import { formatToolResultContent } from '../src/routes/chat/pipeline/toolFeedback.js';
import {
  normalizeToolResultRetryability,
  recordToolResultAndBoundRetryability,
} from '../src/routes/chat/pipeline/toolResultPolicy.js';
import { executeProjectConnector } from '../src/routes/chat/pipeline/executors/connectors.js';
import { PROJECT_CONNECTOR_TOOL_NAMES } from '../src/services/integrations/projectConnectorTools.js';
import { createToolTurnPolicy } from '../src/services/tools/toolTurnPolicy.js';

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
  assert.match(visualFailure, /do not repeat the validation error/);

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

  const openConnector = formatToolResultContent('oc_googlecalendar_find_event', {
    status: 'failed',
    errorCode: 'provider_rejected_query',
    retryable: false,
    detail: 'The provider rejected this query.',
  });
  assert.match(openConnector, /Do not blindly repeat the same call/);
  assert.match(openConnector, /continue without this source or use another tool/);

  const uncertainImageTask = formatToolResultContent('oc_jimeng_ai_submit_image_generation_4_6', {
    status: 'failed',
    errorCode: 'connector_error',
    retryable: true,
  });
  assert.match(uncertainImageTask, /\[retryable: no\]/);
  assert.match(uncertainImageTask, /Do not submit it again automatically/);
});

test('failure feedback keeps error narration out of the answer body', () => {
  const code = formatToolResultContent('code_interpreter', {
    status: 'failed',
    errorCode: 'execution_timeout',
    retryable: false,
    errorMessage: 'execution timed out',
  });
  assert.match(code, /tool card already shows it/);
  assert.doesNotMatch(code, /explain the error to the user/i);

  const workspace = formatToolResultContent('workspace_agent', {
    status: 'failed',
    runId: 'run-1',
    errorCode: 'agent_failed',
    error: 'runner stopped',
  });
  assert.match(workspace, /tool card already shows it/);
  assert.doesNotMatch(workspace, /report the failure/i);

  const connector = formatToolResultContent('arxiv_search', {
    status: 'failed',
    errorCode: 'provider_down',
    retryable: true,
    detail: 'unavailable',
  });
  assert.match(connector, /tool card already shows it/);
  assert.doesNotMatch(connector, /Explain the error/i);

  const generic = formatToolResultContent('some_tool', { status: 'failed', error: 'failed' });
  assert.match(generic, /tool card already shows it/);

  const withDetail = formatToolResultContent('read_attachment', {
    status: 'failed',
    error: 'invalid_file_id',
    detail: 'Pass the fileId uuid exactly as shown in the [Attached file: …] pointer.',
  });
  assert.match(withDetail, /\[detail: Pass the fileId uuid exactly/);
});

test('generic correction and terminal results retain their original payload', () => {
  assert.equal(formatToolResultContent('some_tool', { correction: 'schema feedback' }), 'schema feedback');
  assert.equal(formatToolResultContent('some_tool', { status: 'completed', output: 'result' }), 'result');
  assert.match(formatToolResultContent('some_tool', { status: 'failed', error: 'failed' }), /\[retryable: no\]/);
});

test('tool failures expose the same explicit retryability to connector events and model feedback', async () => {
  const missingRetryability = normalizeToolResultRetryability({ status: 'failed', errorCode: 'app_not_connected' });
  assert.equal(missingRetryability.retryable, false);
  assert.match(formatToolResultContent('some_tool', missingRetryability), /\[retryable: no\]/);

  const transient = normalizeToolResultRetryability({ status: 'failed', errorCode: 'provider_down', retryable: true });
  assert.equal(transient.retryable, true);
  assert.match(formatToolResultContent('some_tool', transient), /\[retryable: yes\]/);

  const events = [];
  const call = {
    id: 'connector-call',
    type: 'function',
    function: { name: PROJECT_CONNECTOR_TOOL_NAMES.GITHUB_IDENTITY, arguments: '' },
  };
  const outcome = await executeProjectConnector({}, call, {
    emitter: { event: (_type, payload) => events.push(payload) },
    req: { userId: 'test-user' },
    projectConnectorConnectionsByProvider: { github: null },
    toolPolicy: createToolTurnPolicy(),
  });
  assert.equal(events[0].retryable, outcome.result.retryable);
  assert.equal(outcome.outcomeRecorded, true);
  assert.equal(outcome.result.retryable, false);
  assert.match(formatToolResultContent(call.function.name, outcome.result), /\[retryable: no\]/);
});

test('transient connector retries stop when the per-tool failure budget is exhausted', () => {
  const policy = createToolTurnPolicy({ perToolFailureLimit: 1 });
  const result = recordToolResultAndBoundRetryability('oomol_gmail_search_threads', {
    status: 'failed',
    errorCode: 'rate_limited',
    retryable: true,
  }, policy);

  assert.equal(result.retryable, false);
  assert.equal(policy.remainingRetries('oomol_gmail_search_threads'), 0);
  assert.match(formatToolResultContent('oomol_gmail_search_threads', result), /\[retryable: no\]/);
});
