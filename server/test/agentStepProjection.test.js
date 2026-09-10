import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_STEP_LABELS,
  normalizeCommand,
  projectAgentEvent,
} from '../src/services/agentStepProjection.js';

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
