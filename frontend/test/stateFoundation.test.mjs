import assert from 'node:assert/strict';
import test from 'node:test';

import { composeRootState, createInitialAppState } from '../src/state/index.ts';
import {
  dispatchPatches,
  dispatchSession,
  resetDomains,
  searchStore,
  sessionStore,
  uiStore,
  updateSessionMessage,
} from '../src/store/index.ts';
import { subscribeLegacyState } from '../src/store/legacyListeners.ts';

test.beforeEach(resetDomains);

test('domain readers expose committed state', () => {
  dispatchPatches({
    session: { topic: 'immutable migration', phase: 'chat', stuckCheckRejected: 3 },
    search: { searchContextError: 'offline' },
  });
  assert.equal(sessionStore.getState().topic, 'immutable migration');
  assert.equal(sessionStore.getState().phase, 'chat');
  assert.equal(sessionStore.getState().stuckCheckRejected, 3);
  assert.equal(searchStore.getState().searchContextError, 'offline');
});

test('domain actions replace committed snapshots', () => {
  const beforeSession = composeRootState().session;
  const before = sessionStore.getState().messages;
  let notifications = 0;
  const dispose = subscribeLegacyState(() => {
    notifications += 1;
  });

  dispatchSession({ type: 'session/set', key: 'topic', value: 'actions' });
  dispatchSession({
    type: 'session/append-message',
    payload: { clientId: 'm-1', role: 'user', rawText: 'hello' },
  });

  assert.equal(sessionStore.getState().topic, 'actions');
  assert.equal(sessionStore.getState().messages.length, 1);
  assert.notStrictEqual(
    composeRootState().session,
    beforeSession,
    'session/set replaces its namespace',
  );
  assert.notStrictEqual(sessionStore.getState().messages, before, 'append replaces the array');
  assert.equal(notifications, 2);
  dispose();
});

test('state batch replaces touched namespaces with one notification', () => {
  const beforeSession = composeRootState().session;
  const beforeUi = composeRootState().ui;
  let notifications = 0;
  const dispose = subscribeLegacyState(() => {
    notifications += 1;
  });
  dispatchPatches({
    session: { topic: 'batched', phase: 'chat' },
    ui: { _userScrolledAway: true },
  });
  assert.equal(sessionStore.getState().topic, 'batched');
  assert.equal(sessionStore.getState().phase, 'chat');
  assert.equal(uiStore.getState()._userScrolledAway, true);
  assert.notStrictEqual(composeRootState().session, beforeSession);
  assert.notStrictEqual(composeRootState().ui, beforeUi);
  assert.equal(notifications, 1);
  dispose();
});

test('message actions replace arrays and guard indexed updates by client id', () => {
  dispatchSession({
    type: 'session/replace-messages',
    payload: [
      { clientId: 'm-1', role: 'user', rawText: 'one' },
      { clientId: 'm-2', role: 'assistant', rawText: 'two' },
    ],
  });
  const initialMessages = sessionStore.getState().messages;
  const initialFirst = initialMessages[0];

  dispatchSession({
    type: 'session/append-message',
    payload: { clientId: 'm-3', role: 'user', rawText: 'three' },
  });
  assert.equal(sessionStore.getState().messages[2].clientId, 'm-3');
  assert.notStrictEqual(sessionStore.getState().messages, initialMessages);
  assert.strictEqual(sessionStore.getState().messages[0], initialFirst);

  const wrongOwner = updateSessionMessage(1, 'stale', { rawText: 'bad' });
  assert.equal(wrongOwner, null);
  const beforeUpdate = sessionStore.getState().messages;
  const updated = updateSessionMessage(1, 'm-2', { rawText: 'updated' });
  assert.equal(updated.rawText, 'updated');
  assert.notStrictEqual(sessionStore.getState().messages, beforeUpdate);
  assert.notStrictEqual(sessionStore.getState().messages[1], beforeUpdate[1]);

  dispatchSession({
    type: 'session/remove-message-at',
    index: 1,
    clientId: 'm-2',
  });
  assert.deepEqual(
    sessionStore.getState().messages.map((message) => message.clientId),
    ['m-1', 'm-3'],
  );
  dispatchSession({ type: 'session/truncate-messages-after', index: 0 });
  assert.deepEqual(
    sessionStore.getState().messages.map((message) => message.clientId),
    ['m-1'],
  );
});

test('deferred stream updates coalesce subscriber notifications', async () => {
  dispatchSession({
    type: 'session/replace-messages',
    payload: [{ clientId: 'stream-1', role: 'assistant', rawText: '', type: 'streaming' }],
  });
  let notifications = 0;
  const dispose = subscribeLegacyState(() => {
    notifications += 1;
  });

  for (const rawText of ['a', 'ab', 'abc']) {
    updateSessionMessage(0, 'stream-1', { rawText }, true);
  }

  assert.equal(sessionStore.getState().messages[0].rawText, 'abc');
  assert.equal(notifications, 0);
  await Promise.resolve();
  assert.equal(notifications, 1);
  dispose();
});

test('state reset replaces every namespace from the shared initial factories', () => {
  dispatchPatches({
    session: { stuckCheckRejected: 9, tutorAttachments: [{ id: 'attachment-old' }] },
    kb: { boundariesHistory: [{ savedAt: 1 }] },
    search: { searchContextError: 'stale' },
    call: { lastCallSource: 'stale' },
    ui: { _canvasPendingId: 'canvas-old' },
    exam: { _examPrevActiveId: 'provider-old' },
  });

  resetDomains();

  const initial = createInitialAppState();
  for (const namespace of ['session', 'kb', 'search', 'call', 'ui', 'exam']) {
    const actual = { ...composeRootState()[namespace] };
    delete actual.revision;
    assert.deepEqual(actual, initial[namespace], namespace);
  }
  assert.equal(sessionStore.getState().tutorAttachments, null);
  assert.equal(sessionStore.getState().tutorPartsTemplate, null);
  assert.equal(sessionStore.getState().stuckCheckRejected, 0);
});
