import assert from 'node:assert/strict';
import test from 'node:test';

const { sessionListState, publishSessionListState, setCurrentSessionId } = await import('../src/ui/sessionListState.ts');

test('session-list publisher snapshots rows and optimistic selection preserves list filters', () => {
  sessionListState.__resetForTests();
  let notifications = 0;
  const unsubscribe = sessionListState.subscribe(() => { notifications += 1; });
  const rows = [
    { id: 'session-1', title: 'Algebra', updatedAt: 100, createdAt: 50 },
  ];
  const update = {
    sessions: rows,
    currentSessionId: null,
    searchQuery: 'algebra',
    filter: 'math',
    fetchFailed: false,
  };

  publishSessionListState(update);
  rows.push({ id: 'session-2', title: 'Geometry', updatedAt: 90, createdAt: 40 });
  sessionListState.flush();

  assert.deepEqual(sessionListState.getSnapshot().sessions.map(({ id }) => id), ['session-1']);
  assert.equal(Object.isFrozen(sessionListState.getSnapshot().sessions), true);
  assert.equal(notifications, 1);
  const committedRows = sessionListState.getSnapshot().sessions;

  publishSessionListState({ ...update, sessions: [...committedRows] });
  sessionListState.flush();
  assert.equal(sessionListState.getSnapshot().sessions, committedRows);
  assert.equal(notifications, 2);

  setCurrentSessionId('session-1');
  sessionListState.flush();
  assert.deepEqual(
    {
      currentSessionId: sessionListState.getSnapshot().currentSessionId,
      searchQuery: sessionListState.getSnapshot().searchQuery,
      filter: sessionListState.getSnapshot().filter,
      sessionIds: sessionListState.getSnapshot().sessions.map(({ id }) => id),
    },
    { currentSessionId: 'session-1', searchQuery: 'algebra', filter: 'math', sessionIds: ['session-1'] },
  );
  assert.equal(sessionListState.getSnapshot().sessions, committedRows);
  assert.equal(notifications, 3);

  setCurrentSessionId('session-1');
  sessionListState.flush();
  assert.equal(notifications, 3);

  unsubscribe();
  sessionListState.__resetForTests();
});
