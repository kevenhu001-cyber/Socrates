import assert from 'node:assert/strict';
import test from 'node:test';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ToolRunRow } from '../src/react/tool-run/ToolRunRow.tsx';
import { ToolRunGroup } from '../src/react/tool-run/ToolRunGroup.tsx';
import { TurnSummaryPill } from '../src/react/tool-run/TurnSummaryPill.tsx';
import { buildTurnLayout, groupOutputCalls } from '../src/react/tool-run/toolRunModel.ts';
import { connectorActivityOf, connectorToolIdOf } from '../src/react/tool-run/toolActivity.ts';
import { toolRunLabel } from '../src/react/tool-run/labels.ts';

const settledAgentView = {
  id: 'tool-agent-1',
  name: 'workspace_agent',
  category: 'agent',
  state: 'done',
  label: 'Worked in the workspace',
  mono: false,
  meta: [],
  sections: [],
  tech: [],
  agentRun: {
    runId: 'run-1',
    steps: [
      {
        stepId: 'step-1',
        kind: 'read',
        title: 'Read file',
        detail: 'src/index.ts',
        status: 'done',
      },
    ],
    plan: null,
    durationMs: 1200,
  },
};

test('agent run host stays in the reading flow while tool details are collapsed', () => {
  const html = renderToStaticMarkup(React.createElement(ToolRunRow, { view: settledAgentView }));

  assert.match(html, /<div class="tool-inline"[^>]*>/);
  assert.doesNotMatch(html, /<details class="tool-inline"[^>]*\sopen(?:="")?/);
  assert.match(html, /<\/div><div class="agent-run-host"><\/div>/);
  assert.doesNotMatch(html, /<details|<summary|aria-expanded/);
});

test('public summaries stay visible without exposing provider reasoning', () => {
  const html = renderToStaticMarkup(React.createElement(TurnSummaryPill, {
    messageId: 'summary', summary: 'Checked workflow steps.',
  }));
  assert.match(html, /<p class="turn-summary-text"><span>Checked workflow steps\.<\/span><\/p>/);
  assert.doesNotMatch(html, /<details|private reasoning|Thought complete/);
});

test('selected activity has one status and no inferred summary', () => {
  const html = renderToStaticMarkup(React.createElement(TurnSummaryPill, {
    messageId: 'active', status: { phase: 'thinking', label: 'Analyzing the question' },
  }));
  assert.equal((html.match(/role="status"/g) || []).length, 1);
  assert.match(html, /thinking-status-label shimmer-text/);
  assert.doesNotMatch(html, /private reasoning|turn-summary-text/);
});

test('running tool labels use the same live text cue as turn status', () => {
  const html = renderToStaticMarkup(React.createElement(ToolRunRow, {
    view: { ...settledAgentView, id: 'tool-live', state: 'running' },
  }));
  assert.match(html, /class="tool-inline-label shimmer-text"/);
});

test('parallel calls keep their original order and all actions stay visible', () => {
  const calls = [
    { id: 'first-running', name: 'Read', input: { path: 'first.ts' }, textOffset: 0 },
    { id: 'second-done', name: 'Read', input: { path: 'second.ts' }, status: 'completed', textOffset: 0 },
  ];
  const segment = buildTurnLayout('Answer.', calls)[0];
  assert.deepEqual(groupOutputCalls(segment).map((call) => call.id), ['first-running', 'second-done']);
  const html = renderToStaticMarkup(React.createElement(ToolRunGroup, { segment }));
  assert.ok(html.indexOf('first-running') < html.indexOf('second-done'));
  assert.doesNotMatch(html, /tool-run-summary|tool-run-list|data-nested/);
  assert.match(html, /Reading first\.ts/);
  assert.match(html, /Read second\.ts/);
});

test('connector actions use service marks and descriptive workflow labels', () => {
  assert.equal(connectorToolIdOf('oc_mcdonalds_cn_get_menu', ['mcdonalds', 'mcdonalds_cn']), 'mcdonalds_cn');
  assert.equal(connectorToolIdOf('google_calendar_list_events', ['googlecalendar']), 'googlecalendar');
  assert.equal(connectorToolIdOf('unknown_tool', ['github']), '');
  assert.deepEqual(connectorActivityOf('oc_github', { action: 'github.get_job_logs' }), { service: 'GitHub', action: 'get_job_logs' });
  assert.equal(toolRunLabel({ name: 'oc_github_list_workflow_run_jobs' }, 'running').text, 'Check GitHub Actions workflow steps');
  assert.equal(toolRunLabel({ name: 'oc_github_get_job_logs' }, 'done').text, 'Read GitHub Actions workflow logs');
});
