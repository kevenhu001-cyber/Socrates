import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = {};

const { createInitialAppState, FLAT_STATE_PATHS } = await import(
  '../src/state/index.ts'
);
await import('../src/state.js');

test('flat state compatibility resolves from namespace metadata', () => {
  window.state.topic = 'immutable migration';
  assert.equal(window.state.session.topic, 'immutable migration');

  window.state.session.phase = 'chat';
  assert.equal(window.state.phase, 'chat');
  window.state.stuckCheckRejected = 3;
  assert.equal(window.state.session.stuckCheckRejected, 3);
  assert.equal(FLAT_STATE_PATHS.searchContextError, 'search.error');
  assert.ok(Object.keys(window.state).includes('examDifficulty'));
});

test('stateStore supports named reads and explicit actions', () => {
  const beforeSession = window.state.session;
  const before = window.state.messages;
  let notifications = 0;
  const dispose = window.stateStore.subscribe(() => { notifications += 1; });

  window.stateStore.dispatch({ type: 'state/set', key: 'topic', value: 'actions' });
  window.stateStore.dispatch({
    type: 'session/append-message',
    payload: { clientId: 'm-1', role: 'user', rawText: 'hello' },
  });

  assert.equal(window.stateStore.read('session.topic'), 'actions');
  assert.equal(window.stateStore.read('topic'), 'actions');
  assert.equal(window.state.messages.length, 1);
  assert.notStrictEqual(window.state.session, beforeSession, 'state/set replaces its namespace');
  assert.notStrictEqual(window.state.messages, before, 'append replaces the array');
  assert.equal(notifications, 2);
  dispose();
});

test('state batch replaces touched namespaces with one notification', () => {
  const beforeSession = window.state.session;
  const beforeUi = window.state.ui;
  let notifications = 0;
  const dispose = window.stateStore.subscribe(() => { notifications += 1; });
  window.stateStore.dispatch({
    type: 'state/batch',
    patch: { topic: 'batched', phase: 'chat', _userScrolledAway: true },
  });
  assert.equal(window.state.topic, 'batched');
  assert.equal(window.state.phase, 'chat');
  assert.equal(window.state._userScrolledAway, true);
  assert.notStrictEqual(window.state.session, beforeSession);
  assert.notStrictEqual(window.state.ui, beforeUi);
  assert.equal(notifications, 1);
  dispose();
});

test('message actions replace arrays and guard indexed updates by client id', () => {
  window.stateStore.dispatch({ type: 'session/replace-messages', payload: [
    { clientId: 'm-1', role: 'user', rawText: 'one' },
    { clientId: 'm-2', role: 'assistant', rawText: 'two' },
  ] });
  const initialMessages = window.state.messages;
  const initialFirst = initialMessages[0];

  const appendedIndex = window.stateStore.dispatch({
    type: 'session/append-message',
    payload: { clientId: 'm-3', role: 'user', rawText: 'three' },
  });
  assert.equal(appendedIndex, 2);
  assert.notStrictEqual(window.state.messages, initialMessages);
  assert.strictEqual(window.state.messages[0], initialFirst);

  const wrongOwner = window.stateStore.dispatch({
    type: 'session/update-message', index: 1, clientId: 'stale', patch: { rawText: 'bad' },
  });
  assert.equal(wrongOwner, null);
  const beforeUpdate = window.state.messages;
  const updated = window.stateStore.dispatch({
    type: 'session/update-message', index: 1, clientId: 'm-2', patch: { rawText: 'updated' },
  });
  assert.equal(updated.rawText, 'updated');
  assert.notStrictEqual(window.state.messages, beforeUpdate);
  assert.notStrictEqual(window.state.messages[1], beforeUpdate[1]);

  const removed = window.stateStore.dispatch({
    type: 'session/remove-message-at', index: 1, clientId: 'm-2',
  });
  assert.equal(removed.clientId, 'm-2');
  const dropped = window.stateStore.dispatch({ type: 'session/truncate-messages-after', index: 0 });
  assert.deepEqual(dropped.map((message) => message.clientId), ['m-3']);
  assert.deepEqual(window.state.messages.map((message) => message.clientId), ['m-1']);
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

  assert.equal(window.state.messages[0].rawText, 'abc');
  assert.equal(notifications, 0);
  await Promise.resolve();
  assert.equal(notifications, 1);
  dispose();
});

test('state reset replaces every namespace from the shared initial factories', () => {
  window.state.stuckCheckRejected = 9;
  window.state.kb.boundariesHistory.push({ savedAt: 1 });
  window.state.search.error = 'stale';
  window.state.call.source = 'stale';
  window.state.ui._canvasPendingId = 'canvas-old';
  window.state.exam._examPrevActiveId = 'provider-old';
  window.state.tutorAttachments = [{ id: 'attachment-old' }];

  window.stateStore.dispatch({ type: 'state/reset' });

  const initial = createInitialAppState();
  for (const namespace of ['session', 'kb', 'search', 'call', 'ui', 'exam']) {
    assert.deepEqual(window.state[namespace], initial[namespace], namespace);
  }
  assert.equal(window.state.tutorAttachments, null);
  assert.equal(window.state.tutorPartsTemplate, null);
  assert.equal(window.state.stuckCheckRejected, 0);
});
