import assert from 'node:assert/strict';
import test from 'node:test';
import { countFindMatches, findMessageMatches } from './findMessages.ts';

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
