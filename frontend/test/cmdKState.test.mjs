import assert from 'node:assert/strict';
import test from 'node:test';

const { cmdKState, publishCmdKState } = await import('../src/ui/cmdKState.ts');

test('Cmd-K state publishes immutable result and recent-query snapshots', () => {
  cmdKState.__resetForTests();
  let notifications = 0;
  const unsubscribe = cmdKState.subscribe(() => { notifications += 1; });
  const results = [{ item: { kind: 'remote', id: 'hit-1', title: 'Algebra', snippet: 'linear equations' } }];
  const recent = ['linear algebra'];

  publishCmdKState({ isOpen: true, query: 'algebra', results, selectedIndex: 0, recent });
  results.push({ item: { kind: 'remote', id: 'hit-2', title: 'Geometry', snippet: 'triangles' } });
  recent.push('geometry');
  cmdKState.flush();

  const snapshot = cmdKState.getSnapshot();
  assert.deepEqual({ isOpen: snapshot.isOpen, query: snapshot.query, selectedIndex: snapshot.selectedIndex }, {
    isOpen: true,
    query: 'algebra',
    selectedIndex: 0,
  });
  assert.equal(snapshot.results.length, 1);
  assert.equal(snapshot.recent.length, 1);
  assert.equal(Object.isFrozen(snapshot.results), true);
  assert.equal(Object.isFrozen(snapshot.recent), true);
  assert.equal(notifications, 1);

  unsubscribe();
  cmdKState.__resetForTests();
});
