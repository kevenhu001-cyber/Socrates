import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AGENT_STEP_LABELS,
  normalizeCommand,
  projectAgentEvent,
} from '../src/services/agentStepProjection.ts';
import { mapCodexNotification } from '../src/services/codexEvents.ts';

/* A recorded Codex turn: plan → read → command → file change → search.
   The shapes match codex-cli 0.147.0's app-server protocol (ThreadItem
   variants commandExecution / fileChange / webSearch / mcpToolCall and the
   turn/plan/updated notification). */
const CODEX_TURN = [
  ['turn/plan/updated', {
    threadId: 't1', turnId: 'u1',
    plan: [
      { step: '定位当前实现', status: 'completed' },
      { step: '修改流式渲染', status: 'inProgress' },
      { step: '补回归测试', status: 'pending' },
    ],
    explanation: '先读代码再改',
  }],
  ['item/started', { item: { id: 'i1', type: 'commandExecution', command: ['bash', '-lc', 'cat server/src/app.ts'], cwd: '[workspace]', status: 'inProgress' } }],
  ['item/completed', { item: { id: 'i1', type: 'commandExecution', command: ['bash', '-lc', 'cat server/src/app.ts'], status: 'completed', exitCode: 0, durationMs: 120, aggregatedOutput: 'import express…' } }],
  ['item/started', { item: { id: 'i2', type: 'commandExecution', command: ['npm', 'run', 'test:unit'], status: 'inProgress' } }],
  ['item/completed', { item: { id: 'i2', type: 'commandExecution', command: ['npm', 'run', 'test:unit'], status: 'completed', exitCode: 0, durationMs: 45_000 } }],
  ['item/started', { item: { id: 'i3', type: 'fileChange', status: 'inProgress', changes: [{ path: '[workspace]/frontend/src/main.js', kind: { type: 'update' }, diff: '@@\n+added\n-removed\n' }] } }],
  ['item/completed', { item: { id: 'i3', type: 'fileChange', status: 'completed', changes: [{ path: '[workspace]/frontend/src/main.js', kind: { type: 'update' }, diff: '@@\n+added\n+more\n-removed\n' }] } }],
  ['item/started', { item: { id: 'i4', type: 'webSearch', query: 'codex app-server protocol', status: 'inProgress' } }],
];

function projectTurn(notifications) {
  return notifications
    .map(([method, params]) => mapCodexNotification(method, params))
    .filter(Boolean)
    .map((mapped) => projectAgentEvent(mapped))
    .filter(Boolean);
}

test('a recorded Codex turn projects into Chinese step labels', () => {
  const projected = projectTurn(CODEX_TURN);
  assert.deepEqual(projected.map((entry) => (entry.type === 'plan' ? '更新了计划' : entry.title)), [
    '更新了计划',
    AGENT_STEP_LABELS.read,            // cat … while running
    AGENT_STEP_LABELS.read,            // cat … completed
    AGENT_STEP_LABELS.command,         // npm run test:unit while running
    '已运行 npm run test:unit',         // npm run test:unit completed
    AGENT_STEP_LABELS.fileChange,
    AGENT_STEP_LABELS.fileChange,
    AGENT_STEP_LABELS.search,
  ]);
});

test('command steps carry the shell script, exit code and duration', () => {
  const mapped = mapCodexNotification('item/completed', {
    item: {
      id: 'i2', type: 'commandExecution', command: ['bash', '-lc', 'npm run build'],
      status: 'completed', exitCode: 0, durationMs: 1234, aggregatedOutput: 'done',
    },
  });
  const step = projectAgentEvent(mapped);
  assert.equal(step.kind, 'command');
  assert.equal(step.title, '已运行 npm run build');
  assert.equal(step.command, 'npm run build');
  assert.equal(step.status, 'done');
  assert.equal(step.exitCode, 0);
  assert.equal(step.durationMs, 1234);
  assert.equal(step.output, 'done');
});

test('a non-zero exit code marks the step failed even when Codex says completed', () => {
  const step = projectAgentEvent(mapCodexNotification('item/completed', {
    item: { id: 'i9', type: 'commandExecution', command: ['npm', 'test'], status: 'completed', exitCode: 1 },
  }));
  assert.equal(step.status, 'failed');
  assert.equal(step.exitCode, 1);
});

test('read-only commands are labelled 读取了文件', () => {
  const reads = ['cat a.ts', 'rg pattern src', 'ls -la', 'sed -n 1,20p a.ts', 'head -5 b.md'];
  for (const command of reads) {
    const step = projectAgentEvent({ event: 'tool', data: { itemId: 'x', type: 'commandExecution', command, status: 'inProgress' } });
    assert.equal(step.kind, 'read', `${command} should read`);
    assert.equal(step.title, AGENT_STEP_LABELS.read);
  }
  // A pipeline or redirect can hide a write, so it stays a command.
  for (const command of ['cat a.ts > b.ts', 'rg pattern | xargs rm', 'npm test']) {
    const step = projectAgentEvent({ event: 'tool', data: { itemId: 'x', type: 'commandExecution', command, status: 'inProgress' } });
    assert.equal(step.kind, 'command', `${command} should not be a read`);
  }
});

test('file-change steps summarize paths and diff counts', () => {
  const step = projectAgentEvent(mapCodexNotification('item/completed', {
    item: {
      id: 'i3', type: 'fileChange', status: 'completed',
      changes: [
        { path: '[workspace]/a/one.ts', kind: { type: 'update' }, diff: '@@\n+x\n+y\n-z\n' },
        { path: '[workspace]/a/two.ts', kind: { type: 'add' }, diff: '@@\n+new\n' },
      ],
    },
  }));
  assert.equal(step.kind, 'file_change');
  assert.equal(step.title, AGENT_STEP_LABELS.fileChange);
  assert.deepEqual(step.diffStat, {
    files: 2, added: 3, removed: 1,
    paths: ['[workspace]/a/one.ts', '[workspace]/a/two.ts'],
  });
  assert.match(step.detail, /one\.ts, two\.ts/);
  assert.match(step.detail, /\+3 -1/);
});

test('mcp steps name the server and tool', () => {
  const step = projectAgentEvent(mapCodexNotification('item/started', {
    item: { id: 'm1', type: 'mcpToolCall', server: 'socrates', tool: 'search_memory', status: 'inProgress' },
  }));
  assert.equal(step.kind, 'mcp');
  assert.equal(step.title, AGENT_STEP_LABELS.mcp);
  assert.equal(step.detail, 'socrates · search_memory');
});

test('plan updates map Codex statuses onto the plan card vocabulary', () => {
  const plan = projectAgentEvent(mapCodexNotification('turn/plan/updated', {
    threadId: 't', turnId: 'u',
    plan: [
      { step: 'a', status: 'completed' },
      { step: 'b', status: 'inProgress' },
      { step: 'c', status: 'pending' },
      { step: '', status: 'pending' },
    ],
    explanation: 'why',
  }));
  assert.equal(plan.type, 'plan');
  assert.deepEqual(plan.steps, [
    { title: 'a', status: 'done' },
    { title: 'b', status: 'in_progress' },
    { title: 'c', status: 'todo' },
  ]);
  assert.equal(plan.explanation, 'why');
});

test('conversation and lifecycle events stay out of the step list', () => {
  const ignored = [
    { event: 'delta', data: { itemId: 'a', delta: 'text' } },
    { event: 'reasoning', data: { itemId: 'a', delta: 'thought' } },
    { event: 'tool_output', data: { itemId: 'a', delta: 'chunk' } },
    { event: 'item_started', data: { itemId: 'a', type: 'agentMessage' } },
    { event: 'item_completed', data: { itemId: 'a', type: 'agentMessage', text: 'hi' } },
    { event: 'item_completed', data: { itemId: 'a', type: 'reasoning' } },
    { event: 'approval_required', data: { requestId: 'r' } },
    { event: 'usage', data: { usage: {} } },
    { event: 'turn_started', data: {} },
    { event: 'run_completed', data: {} },
  ];
  for (const event of ignored) {
    assert.equal(projectAgentEvent(event), null, `${event.event} must not project`);
  }
  assert.equal(projectAgentEvent(null), null);
  assert.equal(projectAgentEvent({ event: 'tool', data: { type: 'commandExecution' } }), null, 'a step needs an item id');
});

test('normalizeCommand unwraps shell wrappers and argv arrays', () => {
  assert.equal(normalizeCommand(['bash', '-lc', 'npm run build']), 'npm run build');
  assert.equal(normalizeCommand(['pwsh', '-Command', 'Get-Content a.txt']), 'Get-Content a.txt');
  assert.equal(normalizeCommand(['npm', 'run', 'test']), 'npm run test');
  assert.equal(normalizeCommand('npm test'), 'npm test');
  assert.equal(normalizeCommand({ argv: ['ls', '-la'] }), 'ls -la');
  assert.equal(normalizeCommand(undefined), '');
});

/* Recorded from a live codex-cli 0.147.0 run: the command arrives as one
   already-joined string with an absolute shell path and quoted payload. */
test('normalizeCommand unwraps the joined shell form Codex actually sends', () => {
  assert.equal(normalizeCommand("/bin/bash -lc 'cat notes.txt'"), 'cat notes.txt');
  assert.equal(normalizeCommand('/bin/bash -lc "printf \'%s\\n\' delta >> notes.txt"'), "printf '%s\\n' delta >> notes.txt");
  assert.equal(normalizeCommand('/usr/bin/zsh -c "ls -la"'), 'ls -la');
  // A non-shell executable keeps its arguments.
  assert.equal(normalizeCommand('git -c core.pager=cat log'), 'git -c core.pager=cat log');
});

test('a read command sent in the joined shell form is still labelled 读取了文件', () => {
  const step = projectAgentEvent({
    event: 'tool',
    data: { itemId: 'i', type: 'commandExecution', command: "/bin/bash -lc 'cat notes.txt'", status: 'inProgress' },
  });
  assert.equal(step.kind, 'read');
  assert.equal(step.title, AGENT_STEP_LABELS.read);
  assert.equal(step.command, 'cat notes.txt');
});

test('redacted workspace markers survive projection unchanged', () => {
  const step = projectAgentEvent({
    event: 'tool',
    data: { itemId: 'i', type: 'commandExecution', command: 'cat [workspace]/server/.env', cwd: '[workspace]', status: 'inProgress' },
  });
  assert.match(step.detail, /\[workspace\]/);
  assert.doesNotMatch(step.detail, /\/home\//);
});
