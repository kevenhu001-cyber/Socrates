import assert from 'node:assert/strict';
import test from 'node:test';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ToolRunRow } from '../src/react/tool-run/ToolRunRow.tsx';

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

  assert.match(html, /<details class="tool-inline"[^>]*>/);
  assert.doesNotMatch(html, /<details class="tool-inline"[^>]*\sopen(?:="")?/);
  assert.match(html, /<\/details><div class="agent-run-host"><\/div>/);
});
