import assert from 'node:assert/strict';
import test from 'node:test';

const { sidebarUserState, publishSidebarUser } = await import('../src/ui/sidebarUserState.ts');

test('sidebar user publisher shares the current account identity', () => {
  sidebarUserState.__resetForTests();
  let notifications = 0;
  const unsubscribe = sidebarUserState.subscribe(() => { notifications += 1; });

  publishSidebarUser({
    initials: 'AT', displayName: 'Ada', email: 'ada@example.test',
    tier: 'descartes', tierLabel: 'Descartes', isSignedIn: true,
  });
  sidebarUserState.flush();

  assert.deepEqual(sidebarUserState.getSnapshot().user, {
    initials: 'AT', displayName: 'Ada', email: 'ada@example.test',
    tier: 'descartes', tierLabel: 'Descartes', isSignedIn: true,
  });
  assert.equal(notifications, 1);

  unsubscribe();
  sidebarUserState.__resetForTests();
});
