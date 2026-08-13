import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequest } from '../src/lib/errors.js';
import { parseChatSessionId } from '../src/lib/sessionOwnership.js';
import { dispatchToolCalls } from '../src/services/toolDispatch.js';
import { createSessionExecutionLock } from '../src/services/sessionExecutionLock.js';

const SESSION_A = '00000000-0000-4000-8000-000000000001';

test('parseChatSessionId accepts an omitted session but rejects malformed authority values', () => {
  assert.equal(parseChatSessionId(undefined), null);
  assert.equal(parseChatSessionId(null), null);
  assert.equal(parseChatSessionId(SESSION_A), SESSION_A);
  assert.throws(() => parseChatSessionId('not-a-uuid'), BadRequest);
  assert.throws(() => parseChatSessionId(['not-a-uuid']), BadRequest);
});

test('session execution lock serializes one session while allowing another session to progress', async () => {
  const lock = createSessionExecutionLock();
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  const first = lock.run('session-a', async () => {
    events.push('a1:start');
    await firstGate;
    events.push('a1:end');
    return 'first';
  });
  const second = lock.run('session-a', async () => {
    events.push('a2:start');
    events.push('a2:end');
    return 'second';
  });
  const other = lock.run('session-b', async () => {
    events.push('b1:start');
    events.push('b1:end');
    return 'other';
  });

  await other;
  assert.deepEqual(events, ['a1:start', 'b1:start', 'b1:end']);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  assert.deepEqual(events, ['a1:start', 'b1:start', 'b1:end', 'a1:end', 'a2:start', 'a2:end']);
  assert.equal(lock.pendingSessions, 0);
});

test('session execution lock recovers after a failed execution', async () => {
  const lock = createSessionExecutionLock();
  let releaseFailure;
  const failureGate = new Promise((resolve) => { releaseFailure = resolve; });
  const first = lock.run('session-a', async () => {
    await failureGate;
    throw new Error('first failed');
  });
  const second = lock.run('session-a', async () => 'recovered');

  releaseFailure();
  await assert.rejects(
    first,
    /first failed/,
  );
  assert.equal(await second, 'recovered');
  assert.equal(lock.pendingSessions, 0);
});

test('tool dispatch serializes registry-marked calls but keeps independent tools concurrent', async () => {
  const calls = [
    { name: 'code_interpreter', id: 'one' },
    { name: 'web_search', id: 'two' },
    { name: 'code_interpreter', id: 'three' },
  ];
  const registry = {
    get(name) {
      return name === 'code_interpreter' ? { sessionSerial: true } : { sessionSerial: false };
    },
  };
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const task = dispatchToolCalls(calls, (call) => call.name, registry, async (call) => {
    events.push(`${call.id}:start`);
    if (call.id === 'one') await firstGate;
    events.push(`${call.id}:end`);
    return call.id;
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ['one:start', 'two:start', 'two:end']);
  releaseFirst();
  assert.deepEqual(await task, ['one', 'two', 'three']);
  assert.deepEqual(events, ['one:start', 'two:start', 'two:end', 'one:end', 'three:start', 'three:end']);
});
