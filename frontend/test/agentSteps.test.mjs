import assert from 'node:assert/strict';
import test from 'node:test';

import {
  agentStepCommand,
  agentStepLabel,
  agentStepMeta,
  formatElapsed,
  truncateAgentText,
} from '../src/ui/agentSteps.ts';

function step(overrides = {}) {
  return {
    stepId: 's1',
    kind: 'command',
    title: '运行了命令',
    detail: 'npm run test:unit',
    command: 'npm run test:unit',
    status: 'running',
    exitCode: null,
    durationMs: null,
    diffStat: null,
    output: null,
    ...overrides,
  };
}

test('elapsed label uses the reference hour/minute/second shape and supplied locale', () => {
  assert.equal(formatElapsed(0), '用时 0s');
  assert.equal(formatElapsed(2_000), '用时 2s');
  assert.equal(formatElapsed(62_000), '用时 1m 2s');
  assert.equal(formatElapsed((1 * 3600 + 39 * 60 + 2) * 1000), '用时 1h 39m 2s');
  assert.equal(formatElapsed(2_000, (key) => key === 'agent.elapsed' ? 'Elapsed' : key), 'Elapsed 2s');
});

test('step labels follow projected kind and translated labels', () => {
  assert.equal(agentStepLabel(step()), '运行了命令');
  assert.equal(agentStepLabel(step({ kind: 'read', status: 'done' })), '读取了文件');
  assert.equal(agentStepLabel(step({ kind: 'file_change', status: 'done' })), '编辑了文件');
  assert.equal(agentStepLabel(step({ kind: 'search', status: 'running' })), '搜索了网页');
  assert.equal(agentStepLabel(step({ kind: 'mcp', status: 'done' })), '调用了 MCP 工具');
  assert.equal(agentStepLabel(step({ kind: 'read' }), (key) => key === 'agent.stepRead' ? 'Read files' : key), 'Read files');
});

test('completed commands move into the label and failure/diff metadata stays concise', () => {
  assert.equal(agentStepLabel(step({ status: 'done' })), '已运行 npm run test:unit');
  assert.equal(agentStepCommand(step({ status: 'done' })), '');
  const fileChange = step({
    kind: 'file_change',
    command: null,
    detail: 'main.ts +12 -4',
    status: 'failed',
    exitCode: 1,
    durationMs: 1234,
    diffStat: { files: 2, added: 12, removed: 4, paths: ['[workspace]/a.ts', '[workspace]/b.ts'] },
  });
  assert.equal(agentStepCommand(fileChange), 'a.ts, b.ts');
  assert.equal(agentStepMeta(fileChange), '2 files  +12 -4  ·  1.2s  ·  exit 1');
});

test('agent text truncation collapses whitespace and keeps output safe to render as text', () => {
  assert.equal(truncateAgentText('  npm   run test  ', 96), 'npm run test');
  assert.equal(truncateAgentText('0123456789', 6), '01234…');
  const untrusted = '<img src=x onerror=alert(1)>';
  assert.equal(agentStepLabel(step({ kind: 'other', title: untrusted })), untrusted);
});
