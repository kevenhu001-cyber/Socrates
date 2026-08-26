import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCodexNotification } from '../src/services/codexEvents.js';

test('normalizes streamed Codex text and tool output into neutral runtime events', () => {
  assert.deepEqual(
    mapCodexNotification('item/agentMessage/delta', { itemId: 'item-1', delta: 'hello' }),
    { event: 'delta', data: { itemId: 'item-1', delta: 'hello' } },
  );
  assert.deepEqual(
    mapCodexNotification('item/commandExecution/outputDelta', { itemId: 'item-2', delta: 'ok\n' }),
    { event: 'tool_output', data: { itemId: 'item-2', delta: 'ok\n' } },
  );
});

test('keeps the exact RPC id for approval decisions', () => {
  const mapped = mapCodexNotification(
    'item/commandExecution/requestApproval',
    { itemId: 'item-3', threadId: 'thread-1', command: 'npm test', cwd: '/workspace', reason: 'write files' },
    42,
  );
  assert.equal(mapped?.event, 'approval_required');
  assert.equal(mapped?.data.requestId, 42);
  assert.equal(mapped?.data.kind, 'commandExecution');
  assert.equal(mapped?.data.command, 'npm test');
});

test('normalizes completed turn status and ignores unknown notifications', () => {
  assert.deepEqual(
    mapCodexNotification('turn/completed', { turn: { id: 'turn-1', status: 'completed' } }),
    { event: 'turn_completed', data: { turnId: 'turn-1', status: 'completed', error: null } },
  );
  assert.equal(mapCodexNotification('some/future/event', {}), null);
});
