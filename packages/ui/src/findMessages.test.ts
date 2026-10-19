import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMessageFindIndex, countFindMatches, findMessageMatches } from './findMessages.ts';

test('find counts case-insensitive, non-overlapping matches', () => {
  assert.equal(countFindMatches('Banana bandana', 'ana'), 2);
  assert.equal(countFindMatches('Anything', '  '), 0);
});

test('find keeps match order and offsets across transcript messages', () => {
  const matches = findMessageMatches([
    { role: 'user', rawText: 'Ask twice: math, Math.' },
    { role: 'assistant', rawText: 'The answer is MATHEMATICS.' },
  ], 'math');
  assert.deepEqual(matches, [
    { messageIndex: 0, offset: 11 },
    { messageIndex: 0, offset: 17 },
    { messageIndex: 1, offset: 14 },
  ]);
});

test('index computes global row offsets and content fallback in one pass', () => {
  assert.deepEqual(buildMessageFindIndex([
    { role: 'user', rawText: 'Alpha alpha' },
    { role: 'assistant', rawText: 'No match' },
    { role: 'assistant', rawText: '', content: 'ALPHA' },
  ], ' alpha '), {
    offsets: [0, 2, 2],
    matches: [{ messageIndex: 0, offset: 0 }, { messageIndex: 0, offset: 6 }, { messageIndex: 2, offset: 0 }],
  });
});

test('cached normalization refreshes when the same message changes', () => {
  const message = { role: 'assistant' as const, rawText: 'first chunk' };
  assert.deepEqual(findMessageMatches([message], 'chunk'), [{ messageIndex: 0, offset: 6 }]);
  message.rawText = 'updated CHUNK';
  assert.deepEqual(findMessageMatches([message], 'updated'), [{ messageIndex: 0, offset: 0 }]);
  assert.deepEqual(findMessageMatches([message], 'chunk'), [{ messageIndex: 0, offset: 8 }]);
});

test('empty query does not inspect messages or allocate per-row offsets', () => {
  const message = { role: 'assistant' as const, get rawText(): string { throw new Error('Must not scan'); } };
  assert.deepEqual(buildMessageFindIndex([message], '  '), { matches: [], offsets: [] });
});
