import assert from 'node:assert/strict';
import test from 'node:test';
import { OUTBOX_MAX_OPS, createMessageOutbox } from './outbox.ts';
import { createMemoryStore } from '@socrates/platform';

function apiError(status: number) {
  return Object.assign(new Error(`failed (${status})`), { status });
}

function harness() {
  const calls: Array<{ kind: string; id: string; content?: string }> = [];
  const failures = new Map<string, number>();
  const outbox = createMessageOutbox({
    storage: createMemoryStore(),
    patchMessage: async (_session, id, content) => {
      calls.push({ kind: 'patch', id, content });
      const status = failures.get(`patch:${id}`);
      if (status) throw apiError(status);
    },
    deleteMessage: async (_session, id) => {
      calls.push({ kind: 'delete', id });
      const status = failures.get(`delete:${id}`);
      if (status) throw apiError(status);
    },
    isOnline: () => true,
  });
  return { outbox, calls, failures };
}

test('queued patches and deletes drain oldest-first with per-op progress', async () => {
  const { outbox, calls } = harness();
  await outbox.queueMessageOp('s1', 'dropped-a', 'delete');
  await outbox.queueMessageOp('s1', 'dropped-b', 'delete');
  await outbox.queueMessageOp('s1', 'anchor', 'patch', 'revised');
  assert.equal(await outbox.pendingOpCount(), 3);
  assert.equal(await outbox.drainMessageOutbox(), 3);
  assert.deepEqual(calls.map((c) => `${c.kind}:${c.id}`), ['delete:dropped-a', 'delete:dropped-b', 'patch:anchor']);
  assert.equal(await outbox.pendingOpCount(), 0);
});

test('a regenerate queues only deletes, never a text patch', async () => {
  const { outbox, calls } = harness();
  await outbox.queueMessageOp('s1', 'stale-reply', 'delete');
  assert.equal(await outbox.drainMessageOutbox(), 1);
  assert.deepEqual(calls, [{ kind: 'delete', id: 'stale-reply' }]);
});

test('a 404 drops the op while a network error stops the drain', async () => {
  const { outbox, calls, failures } = harness();
  failures.set('delete:gone', 404);
  failures.set('delete:flaky', 503);
  await outbox.queueMessageOp('s1', 'gone', 'delete');
  await outbox.queueMessageOp('s1', 'flaky', 'delete');
  await outbox.queueMessageOp('s1', 'later', 'delete');
  assert.equal(await outbox.drainMessageOutbox(), 1);
  // The 404 row is gone; the flaky row and everything after it stays queued.
  assert.equal(await outbox.pendingOpCount(), 2);
  failures.delete('delete:flaky');
  assert.equal(await outbox.drainMessageOutbox(), 2);
  assert.equal(await outbox.pendingOpCount(), 0);
  assert.ok(calls.some((c) => c.id === 'later'));
});

test('invalid queue entries are ignored and bad queue calls are no-ops', async () => {
  const { outbox } = harness();
  await outbox.queueMessageOp('s1', '', 'delete');
  await outbox.queueMessageOp('s1', 'x', 'delete');
  await outbox.queueMessageOp('s1', 'anchor', 'patch');
  assert.deepEqual((await outbox.readQueueForTest()).map((op) => op.id), ['x']);
});

test('the queue caps at 500 ops, newest wins', async () => {
  const { outbox } = harness();
  for (let i = 0; i < OUTBOX_MAX_OPS + 10; i++) {
    await outbox.queueMessageOp('s1', `row-${i}`, 'delete');
  }
  const queued = await outbox.readQueueForTest();
  assert.equal(queued.length, OUTBOX_MAX_OPS);
  assert.equal(queued.at(-1)?.id, `row-${OUTBOX_MAX_OPS + 9}`);
});

test('an offline drain leaves the queue untouched', async () => {
  let networkCalls = 0;
  const offline = createMessageOutbox({
    storage: createMemoryStore(),
    patchMessage: async () => { networkCalls++; },
    deleteMessage: async () => { networkCalls++; },
    isOnline: () => false,
  });
  await offline.queueMessageOp('s1', 'row', 'delete');
  assert.equal(await offline.drainMessageOutbox(), 0);
  assert.equal(await offline.pendingOpCount(), 1);
  assert.equal(networkCalls, 0);
});
