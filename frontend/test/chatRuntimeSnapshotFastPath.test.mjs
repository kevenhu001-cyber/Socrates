import assert from 'node:assert/strict';
import test from 'node:test';

const { reconcileMessageSnapshots } = await import('../src/react/chatRuntimeSnapshot.ts');

test('a frozen domain transcript crosses reconciliation zero-copy', () => {
  const row = Object.freeze({
    clientId: 'm-domain',
    role: 'assistant',
    rawText: 'immutable answer',
  });
  const transcript = Object.freeze([row]);

  const published = reconcileMessageSnapshots(
    Object.freeze([]),
    transcript,
    new Set(['stale-event-id']),
  );

  assert.equal(published, transcript);
  assert.equal(published[0], row);
});
