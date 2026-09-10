import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://app.example.test/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

const {
  bumpPendingSeq,
  clearPendingTurn,
  loadPendingTurn,
  newClientTurnId,
  pendingKey,
  savePendingTurn,
} = await import('../src/chat/turnClient.ts');

/* M1: the pending-turn pointer lets a reload/reconnect re-attach to the
   same server turn instead of opening a second LLM call. */
test('pending turn round-trips per session', () => {
  savePendingTurn('sess-1', { turnId: 'turn-1', clientTurnId: 'c-1', lastSeq: 7 });
  const loaded = loadPendingTurn('sess-1');
  assert.equal(loaded.turnId, 'turn-1');
  assert.equal(loaded.clientTurnId, 'c-1');
  assert.equal(loaded.lastSeq, 7);
  assert.equal(loaded.sessionId, 'sess-1');
  clearPendingTurn('sess-1');
  assert.equal(loadPendingTurn('sess-1'), null);
});

test('pending turns are isolated per session', () => {
  savePendingTurn('sess-a', { turnId: 't-a', clientTurnId: 'c-a', lastSeq: 1 });
  savePendingTurn('sess-b', { turnId: 't-b', clientTurnId: 'c-b', lastSeq: 2 });
  assert.equal(loadPendingTurn('sess-a').turnId, 't-a');
  assert.equal(loadPendingTurn('sess-b').turnId, 't-b');
  clearPendingTurn('sess-a');
  clearPendingTurn('sess-b');
});

test('bumpPendingSeq advances the resume offset', () => {
  savePendingTurn('sess-2', { turnId: 't-2', clientTurnId: 'c-2', lastSeq: 3 });
  bumpPendingSeq('sess-2', 9);
  assert.equal(loadPendingTurn('sess-2').lastSeq, 9);
  clearPendingTurn('sess-2');
});

test('newClientTurnId yields unique ids', () => {
  const a = newClientTurnId();
  const b = newClientTurnId();
  assert.ok(a && b && a !== b);
  assert.notEqual(pendingKey('x'), pendingKey('y'));
});
