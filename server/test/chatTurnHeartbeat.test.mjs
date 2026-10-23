/**
 * P_heartbeat-error-not-abort — the execution heartbeat must only abort the
 * turn when the server can PROVE the turn is no longer ours.
 *
 * The controller signal this aborts IS the upstream fetch signal, so aborting
 * on a transient database error truncates an answer the provider is still
 * billing for, and the turn is recorded as failed even though the model
 * finished. A failed heartbeat proves nothing: leave the turn running and let
 * recoverStaleChatTurns() reclaim it if the database really is gone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runExecutionHeartbeat } from '../src/services/core/chatTurns.js';

test('a heartbeat that cannot reach the database leaves the paid stream running', async () => {
  const controller = new AbortController();
  await runExecutionHeartbeat(controller, async () => {
    throw new Error('connection terminated unexpectedly');
  });
  assert.equal(
    controller.signal.aborted,
    false,
    'a transient database error must not abort a stream the provider is still billing for',
  );
});

test('a heartbeat that proves the turn was taken over aborts the stream', async () => {
  const controller = new AbortController();
  await runExecutionHeartbeat(controller, async () => false);
  assert.equal(controller.signal.aborted, true);
  assert.equal(controller.signal.reason, 'turn_interrupted');
});

test('a healthy heartbeat leaves the stream running', async () => {
  const controller = new AbortController();
  await runExecutionHeartbeat(controller, async () => true);
  assert.equal(controller.signal.aborted, false);
});
