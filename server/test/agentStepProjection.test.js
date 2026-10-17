import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_STEP_LABELS,
  normalizeCommand,
  projectAgentEvent,
} from '../src/services/tools/agentStepProjection.js';

test('projects Pi tool lifecycle events into command / file / search steps', () => {
  const started = projectAgentEvent({
    event: 'tool',
    data: { itemId: 'c1', type: 'commandExecution', command: 'rm -rf build', status: 'inProgress' },
  });
  assert.equal(started.type, 'step');
  assert.equal(started.kind, 'command');
  assert.equal(started.status, 'running');
  assert.equal(started.command, 'rm -rf build');

  const done = projectAgentEvent({
    event: 'item_completed',
    data: { itemId: 'c1', type: 'commandExecution', command: 'npm run build', status: 'completed', exitCode: 0, aggregatedOutput: 'ok' },
  });
  assert.equal(done.kind, 'command');
  assert.equal(done.status, 'done');

  const read = projectAgentEvent({
    event: 'item_completed',
    data: { itemId: 'r1', type: 'commandExecution', command: 'ls -la', status: 'completed', exitCode: 0 },
  });
  assert.equal(read.kind, 'read');

  const failed = projectAgentEvent({
    event: 'item_completed',
    data: { itemId: 'c2', type: 'commandExecution', command: 'false', status: 'completed', exitCode: 2 },
  });
  assert.equal(failed.status, 'failed');

  const file = projectAgentEvent({
    event: 'item_completed',
    data: { itemId: 'f1', type: 'fileChange', status: 'completed', changes: [{ path: 'src/a.ts', kind: 'edit' }] },
  });
  assert.equal(file.kind, 'file_change');

  const search = projectAgentEvent({
    event: 'item_completed',
    data: { itemId: 's1', type: 'webSearch', query: 'pi agent', status: 'completed' },
  });
  assert.equal(search.kind, 'search');
  assert.equal(search.detail, 'pi agent');

  assert.equal(projectAgentEvent({ event: 'delta', data: { delta: 'hi' } }), null);
  assert.equal(projectAgentEvent({ event: 'tool', data: {} }), null);
});

test('normalizeCommand unwraps shell wrappers', () => {
  assert.equal(normalizeCommand(['/bin/bash', '-lc', 'cat notes.txt']), 'cat notes.txt');
  assert.equal(normalizeCommand('/bin/bash -lc "ls -la"'), 'ls -la');
  assert.equal(AGENT_STEP_LABELS.command, '运行了命令');
});

test('projects plans, file diffs, MCP calls and bounded output', () => {
  const plan = projectAgentEvent({
    event: 'plan',
    data: {
      plan: [
        { step: 'Read the file', status: 'completed' },
        { title: 'Apply the fix', status: 'active' },
        {},
      ],
      explanation: 'working through the repair',
    },
  });
  assert.equal(plan.type, 'plan');
  assert.deepEqual(plan.steps.map((step) => step.status), ['done', 'in_progress']);
  assert.equal(plan.explanation, 'working through the repair');
  assert.equal(projectAgentEvent({ event: 'plan', data: { plan: [{}] } }), null);

  const file = projectAgentEvent({
    event: 'item_completed',
    data: {
      itemId: 'f2',
      type: 'fileChange',
      status: 'success',
      changes: [
        { path: 'src/one.ts', diff: '+new\n-old\n+++ header\n--- header' },
        { path: 'src/two.ts', diff: '+another' },
        { path: 'src/three.ts' },
        { path: 'src/four.ts' },
      ],
    },
  });
  assert.equal(file.status, 'done');
  assert.deepEqual(file.diffStat, { files: 4, added: 2, removed: 1, paths: ['src/one.ts', 'src/two.ts', 'src/three.ts', 'src/four.ts'] });
  assert.match(file.detail, /等 4 个文件/);

  const mcp = projectAgentEvent({
    event: 'tool',
    data: { itemId: 'm1', type: 'mcpToolCall', server: 'docs', name: 'search', status: 'pending', durationMs: 12 },
  });
  assert.equal(mcp.kind, 'mcp');
  assert.equal(mcp.detail, 'docs · search');
  assert.equal(mcp.durationMs, 12);
  assert.equal(projectAgentEvent({ event: 'item_completed', data: { itemId: 'm2', type: 'mcpToolCall' } }).detail, null);

  const longOutput = projectAgentEvent({
    event: 'item_completed',
    data: { itemId: 'c3', type: 'commandExecution', command: { argv: ['python', '-c', 'print(1)'] }, status: 'succeeded', aggregatedOutput: 'x'.repeat(4100) },
  });
  assert.equal(longOutput.status, 'done');
  assert.match(longOutput.output, /^…/);
});

test('normalizes command variants and rejects hidden or malformed events', () => {
  assert.equal(normalizeCommand({ command: ['bash', '-c', 'echo ok'] }), 'echo ok');
  assert.equal(normalizeCommand({ argv: ['rg', 'needle'] }), 'rg needle');
  assert.equal(normalizeCommand(['/bin/bash', '-lc', "echo 'quoted'"]), "echo 'quoted'");
  assert.equal(normalizeCommand(null), '');

  assert.equal(projectAgentEvent({ event: 'item_completed', data: { itemId: 'c4', type: 'commandExecution', command: 'cat file', status: 'error' } }).status, 'failed');
  assert.equal(projectAgentEvent({ event: 'tool', data: { itemId: 'c5', type: 'commandExecution', command: '', status: 'unknown' } }).title, AGENT_STEP_LABELS.command);
  assert.equal(projectAgentEvent({ event: 'item_completed', data: { itemId: 'x1', type: 'futureType' } }), null);
  assert.equal(projectAgentEvent({ event: 'item_completed', data: { type: 'commandExecution' } }), null);
});
