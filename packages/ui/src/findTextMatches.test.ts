import test from 'node:test';
import assert from 'node:assert/strict';
import { findTextMatches } from './findTextMatches.ts';

test('findTextMatches returns non-overlapping case-insensitive ranges', () => {
  assert.deepEqual(findTextMatches('Alpha beta ALPHA', 'alpha'), [[0, 5], [11, 16]]);
});

test('findTextMatches handles empty and absent queries', () => {
  assert.deepEqual(findTextMatches('anything', ''), []);
  assert.deepEqual(findTextMatches('anything', 'missing'), []);
});

test('findTextMatches advances after each full match', () => {
  assert.deepEqual(findTextMatches('aaaaa', 'aa'), [[0, 2], [2, 4]]);
});
