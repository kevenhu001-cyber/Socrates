import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = {};

const { createInitialAppState } = await import('../src/state/index.ts');
const { stateStore } = await import('../src/state/store.js');

test('named state reads resolve fields without a flat compatibility table', () => {
  stateStore.dispatch({ type: 'state/batch', patch: {
    topic: 'immutable migration',
    phase: 'chat',
    stuckCheckRejected: 3,
    searchContextError: 'offline',
  } });
  assert.equal(stateStore.read('topic'), 'immutable migration');
  assert.equal(stateStore.read('session.topic'), 'immutable migration');
  assert.equal(stateStore.read('phase'), 'chat');
  assert.equal(stateStore.read('stuckCheckRejected'), 3);
  assert.equal(stateStore.read('searchContextError'), 'offline');
});

test('stateStore supports named reads and explicit actions', () => {
  const beforeSession = stateStore.getSnapshot().session;
  const before = stateStore.read('messages');
  let notifications = 0;
  const dispose = window.stateStore.subscribe(() => { notifications += 1; });

  window.stateStore.dispatch({ type: 'state/set', key: 'topic', value: 'actions' });
  window.stateStore.dispatch({
    type: 'session/append-message',
    payload: { clientId: 'm-1', role: 'user', rawText: 'hello' },
  });

  assert.equal(stateStore.read('session.topic'), 'actions');
  assert.equal(stateStore.read('topic'), 'actions');
  assert.equal(stateStore.read('messages').length, 1);
  assert.notStrictEqual(stateStore.getSnapshot().session, beforeSession, 'state/set replaces its namespace');
  assert.notStrictEqual(stateStore.read('messages'), before, 'append replaces the array');
  assert.equal(notifications, 2);
  dispose();
});

test('state batch replaces touched namespaces with one notification', () => {
  const beforeSession = stateStore.getSnapshot().session;
  const beforeUi = stateStore.getSnapshot().ui;
  let notifications = 0;
  const dispose = window.stateStore.subscribe(() => { notifications += 1; });
  window.stateStore.dispatch({
    type: 'state/batch',
    patch: { topic: 'batched', phase: 'chat', _userScrolledAway: true },
  });
  assert.equal(stateStore.read('topic'), 'batched');
  assert.equal(stateStore.read('phase'), 'chat');
  assert.equal(stateStore.read('_userScrolledAway'), true);
  assert.notStrictEqual(stateStore.getSnapshot().session, beforeSession);
  assert.notStrictEqual(stateStore.getSnapshot().ui, beforeUi);
  assert.equal(notifications, 1);
  dispose();
});

test('message actions replace arrays and guard indexed updates by client id', () => {
  window.stateStore.dispatch({ type: 'session/replace-messages', payload: [
    { clientId: 'm-1', role: 'user', rawText: 'one' },
    { clientId: 'm-2', role: 'assistant', rawText: 'two' },
  ] });
  const initialMessages = stateStore.read('messages');
  const initialFirst = initialMessages[0];

  const appendedIndex = window.stateStore.dispatch({
    type: 'session/append-message',
    payload: { clientId: 'm-3', role: 'user', rawText: 'three' },
  });
  assert.equal(appendedIndex, 2);
  assert.notStrictEqual(stateStore.read('messages'), initialMessages);
  assert.strictEqual(stateStore.read('messages')[0], initialFirst);

  const wrongOwner = window.stateStore.dispatch({
    type: 'session/update-message', index: 1, clientId: 'stale', patch: { rawText: 'bad' },
  });
  assert.equal(wrongOwner, null);
  const beforeUpdate = stateStore.read('messages');
  const updated = window.stateStore.dispatch({
    type: 'session/update-message', index: 1, clientId: 'm-2', patch: { rawText: 'updated' },
  });
  assert.equal(updated.rawText, 'updated');
  assert.notStrictEqual(stateStore.read('messages'), beforeUpdate);
  assert.notStrictEqual(stateStore.read('messages')[1], beforeUpdate[1]);

  const removed = window.stateStore.dispatch({
    type: 'session/remove-message-at', index: 1, clientId: 'm-2',
  });
  assert.equal(removed.clientId, 'm-2');
  const dropped = window.stateStore.dispatch({ type: 'session/truncate-messages-after', index: 0 });
  assert.deepEqual(dropped.map((message) => message.clientId), ['m-3']);
  assert.deepEqual(stateStore.read('messages').map((message) => message.clientId), ['m-1']);
});

test('deferred stream updates coalesce subscriber notifications', async () => {
  window.stateStore.dispatch({
    type: 'session/replace-messages',
    payload: [{ clientId: 'stream-1', role: 'assistant', rawText: '', type: 'streaming' }],
  });
  let notifications = 0;
  const dispose = window.stateStore.subscribe(() => { notifications += 1; });

  for (const rawText of ['a', 'ab', 'abc']) {
    window.stateStore.dispatch({
      type: 'session/update-message',
      index: 0,
      clientId: 'stream-1',
      patch: { rawText },
      deferNotify: true,
    });
  }

  assert.equal(stateStore.read('messages')[0].rawText, 'abc');
  assert.equal(notifications, 0);
  await Promise.resolve();
  assert.equal(notifications, 1);
  dispose();
});

test('state reset replaces every namespace from the shared initial factories', () => {
  stateStore.dispatch({ type: 'state/batch', patch: {
    stuckCheckRejected: 9,
    boundariesHistory: [{ savedAt: 1 }],
    searchContextError: 'stale',
    lastCallSource: 'stale',
    _canvasPendingId: 'canvas-old',
    _examPrevActiveId: 'provider-old',
    tutorAttachments: [{ id: 'attachment-old' }],
  } });

  window.stateStore.dispatch({ type: 'state/reset' });

  const initial = createInitialAppState();
  for (const namespace of ['session', 'kb', 'search', 'call', 'ui', 'exam']) {
    const actual = { ...stateStore.getSnapshot()[namespace] };
    delete actual.revision;
    assert.deepEqual(actual, initial[namespace], namespace);
  }
  assert.equal(stateStore.read('tutorAttachments'), null);
  assert.equal(stateStore.read('tutorPartsTemplate'), null);
  assert.equal(stateStore.read('stuckCheckRejected'), 0);
});
