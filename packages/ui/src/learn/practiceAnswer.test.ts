import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePracticeAnswer } from './practiceAnswer.ts';

test('practice answer normalization preserves punctuation and quote behavior', () => {
  assert.equal(evaluatePracticeAnswer('42!!!', '42'), 'correct');
  assert.equal(evaluatePracticeAnswer('“x = 1”', 'x=1'), 'correct');
  assert.equal(evaluatePracticeAnswer('42!!!x', '42'), 'unverified');
});

test('long runs of punctuation do not trigger excessive backtracking', () => {
  assert.equal(evaluatePracticeAnswer('!'.repeat(100_000) + 'x', 'different'), 'unverified');
});
