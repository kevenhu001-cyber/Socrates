import assert from 'node:assert/strict';
import test from 'node:test';

const { shareState, publishShareState } = await import('../src/ui/shareState.ts');

test('share publisher shares visibility and link status with React subscribers', () => {
  shareState.__resetForTests();
  let notifications = 0;
  const unsubscribe = shareState.subscribe(() => { notifications += 1; });

  publishShareState({
    visibility: 'private',
    shareToken: 'share-token',
    shareUrl: 'https://example.test/?share=share-token',
    status: 'Share link ready.',
    error: '',
  });
  shareState.flush();

  const snapshot = shareState.getSnapshot();
  assert.equal(snapshot.visibility, 'private');
  assert.equal(snapshot.shareToken, 'share-token');
  assert.equal(snapshot.shareUrl, 'https://example.test/?share=share-token');
  assert.equal(snapshot.status, 'Share link ready.');
  assert.equal(snapshot.error, '');
  assert.equal(notifications, 1);

  unsubscribe();
  shareState.__resetForTests();
});
