import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
};

const archive = await import('../src/tutor/mistakeArchive.ts');

test('RN-14 the archive keeps each session\'s book, including an emptied one', () => {
  archive.resetMistakeArchive();
  store.clear();
  archive.archiveSessionMistakes('s1', '导数', [{ id: 'm1', q: 'd/dx x²', timestamp: 1 }]);
  archive.archiveSessionMistakes('s2', '积分', []);
  archive.archiveSessionMistakes(null, 'x', [{ id: 'ignored' }]);
  const others = archive.otherSessionMistakes();
  assert.deepEqual(others.map((row) => [row.sessionId, row.label, row.mistakes.length]), [['s1', '导数', 1], ['s2', '积分', 0]]);
  assert.deepEqual(archive.findArchivedMistake('m1'), { id: 'm1', q: 'd/dx x²', timestamp: 1, sessionId: 's1' });

  /* Survives a reload (storage, not memory). */
  archive.resetMistakeArchive();
  assert.equal(archive.otherSessionMistakes().length, 2);

  archive.forgetArchivedSession('s1');
  assert.equal(archive.findArchivedMistake('m1'), null, 'a deleted session leaves the book');
});

test('RN-14 server rows fill in only the sessions the archive does not know', async () => {
  archive.resetMistakeArchive();
  store.clear();
  archive.archiveSessionMistakes('known', '已打开', []);
  await archive.loadServerMistakes(async () => ({ items: [
    { id: 'u1', sessionId: 'known', questionContent: 'conquered long ago', source: 'quiz', collectedAt: '2026-11-01T00:00:00Z' },
    { id: 'u2', sessionId: 'remote', questionContent: '∫x dx', userAnswer: 'x', correctAnswer: 'x²/2', source: 'practice', collectedAt: '2026-11-01T00:00:00Z' },
    { id: 'u3', sessionId: null, questionContent: 'no session' },
  ] }), () => ({ remote: '积分入门' }));
  const others = archive.otherSessionMistakes();
  assert.deepEqual(others.map((row) => row.sessionId), ['known', 'remote']);
  const remote = others[1];
  assert.equal(remote.label, '积分入门');
  assert.deepEqual(remote.mistakes[0], {
    id: 'srv:u2', type: 'practice', topic: '', node: undefined, q: '∫x dx', options: [],
    correct: 'x²/2', userAnswer: 'x', timestamp: Date.parse('2026-11-01T00:00:00Z'), resolved: false,
  });
  assert.equal(archive.findArchivedMistake('srv:u2')?.sessionId, 'remote');
});

test('RN-14 another signed-in user gets their own archive', () => {
  archive.resetMistakeArchive();
  store.clear();
  globalThis.window = { CURRENT_USER: { id: 'alice' } };
  archive.archiveSessionMistakes('s-alice', 'A', [{ id: 'a1', q: 'q' }]);
  globalThis.window = { CURRENT_USER: { id: 'bob' } };
  assert.deepEqual(archive.otherSessionMistakes(), []);
  globalThis.window = { CURRENT_USER: { id: 'alice' } };
  assert.equal(archive.otherSessionMistakes().length, 1);
  delete globalThis.window;
});
