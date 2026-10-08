import assert from 'node:assert/strict';
import test from 'node:test';
import type { Session } from '@socrates/contracts';
import { useChatStore, visibleSessions } from './index.ts';

const row = (id: string, projectId: string | null = null): Session => ({ id, projectId, topic: '', mode: 'chat', messages: [] });

function reset(rows: Session[], active: string) {
  const store = useChatStore.getState();
  store.reset();
  store.setSessions(rows);
  store.selectSession(active);
  return store;
}

test('destructive session removal keeps the departing id hidden through immediate project fallback', () => {
  const store = reset([row('server-a', 'p'), row('server-b', 'q')], 'server-a');
  store.removeProject('p');
  assert.equal(useChatStore.getState().activeSessionId, 'server-b');
  assert.ok(useChatStore.getState().sessions.some((session) => session.id === 'server-a' && !!session.archivedAt));
  assert.deepEqual(visibleSessions(useChatStore.getState().sessions).map((session) => session.id), ['server-b']);

  // App.deleteProject may call selectProject synchronously after removeProject.
  // The transition sentinel must survive until React observes the active-id
  // change, otherwise transcript-local redo state can be mistaken for an id
  // adoption and rebound from server-a to server-b.
  store.selectProject(null);
  assert.ok(useChatStore.getState().sessions.some((session) => session.id === 'server-a'));
  assert.deepEqual(visibleSessions(useChatStore.getState().sessions).map((session) => session.id), ['server-b']);

  store.selectSession('server-b');
  assert.equal(useChatStore.getState().sessions.some((session) => session.id === 'server-a'), false);
});

test('delete/reconcile retain a hidden transition id but local-to-server adoption does not', () => {
  let store = reset([row('server-a'), row('server-b')], 'server-a');
  store.deleteSession('server-a');
  assert.equal(useChatStore.getState().activeSessionId, 'server-b');
  assert.ok(useChatStore.getState().sessions.some((session) => session.id === 'server-a'));
  assert.deepEqual(visibleSessions(useChatStore.getState().sessions).map((session) => session.id), ['server-b']);

  store.selectSession('server-b');
  store = useChatStore.getState();
  store.setSessions([row('server-c'), row('server-b')]);
  store.selectSession('server-c');
  store.reconcileSessions([row('server-b')]);
  assert.equal(useChatStore.getState().activeSessionId, 'server-b');
  assert.ok(useChatStore.getState().sessions.some((session) => session.id === 'server-c'));

  store.selectSession('server-b');
  store = useChatStore.getState();
  store.setSessions([row('session-local'), row('server-b')]);
  store.selectSession('session-local');
  store.adoptSessionId('session-local', row('11111111-1111-4111-8111-111111111111'));
  assert.equal(useChatStore.getState().activeSessionId, '11111111-1111-4111-8111-111111111111');
  assert.equal(useChatStore.getState().sessions.some((session) => session.id === 'session-local'), false);
});
