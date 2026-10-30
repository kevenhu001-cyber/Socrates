import assert from 'node:assert/strict';
import test from 'node:test';

const { profileState, publishProfileState } = await import('../src/ui/profileState.ts');

test('profile publisher shares account and preference state with React subscribers', () => {
  profileState.__resetForTests();
  let notifications = 0;
  const unsubscribe = profileState.subscribe(() => { notifications += 1; });

  publishProfileState({
    user: {
      initials: 'AT', displayName: 'Ada Turing', email: 'ada@example.test',
      joinedAt: 'October 30, 2026', verifiedAt: null, userId: 'user-1',
      tier: 'descartes', subEnd: null,
    },
    webSearchOn: true,
    currentLang: 'zh',
    instResponse: 'Use concise explanations.',
    instAbout: 'I study mathematics.',
    instSaveState: null,
  });
  profileState.flush();

  const snapshot = profileState.getSnapshot();
  assert.equal(snapshot.user.displayName, 'Ada Turing');
  assert.equal(snapshot.webSearchOn, true);
  assert.equal(snapshot.currentLang, 'zh');
  assert.equal(snapshot.instResponse, 'Use concise explanations.');
  assert.equal(snapshot.instAbout, 'I study mathematics.');
  assert.equal(notifications, 1);

  unsubscribe();
  profileState.__resetForTests();
});
