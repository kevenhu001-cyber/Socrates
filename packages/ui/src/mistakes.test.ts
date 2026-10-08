import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildPracticeMistake, buildQuizMistake, prependMistake, unresolvedMistakeCount } from './mistakes.ts';

test('a wrong quiz pick with a declared answer lands in the book', () => {
  const mistake = buildQuizMistake({ sessionId: 's1', nodeName: 'Algebra', question: 'What is 2+2?', picked: 'A', pickedText: '3', correct: 'B' });
  assert.ok(mistake);
  assert.equal(mistake?.source, 'quiz');
  assert.equal(mistake?.userAnswer, 'A. 3');
  assert.equal(mistake?.correctAnswer, 'B');
  assert.equal(mistake?.isResolved, false);
});

test('right picks and undeclared answers never land', () => {
  assert.equal(buildQuizMistake({ sessionId: 's1', question: 'Q', picked: 'B', correct: 'B' }), null);
  assert.equal(buildQuizMistake({ sessionId: 's1', question: 'Q', picked: 'A', correct: null }), null);
  assert.equal(buildPracticeMistake({ sessionId: 's1', problem: 'P', answer: 'x=5', correct: null }), null);
  assert.equal(buildPracticeMistake({ sessionId: 's1', problem: 'P', answer: 'x=4', correct: 'x=4' }), null);
});

test('incorrect practice attempts land with the attempt preserved', () => {
  const mistake = buildPracticeMistake({ sessionId: 's1', problem: 'Solve x+1=2', answer: 'x=5', correct: 'x=1' });
  assert.ok(mistake);
  assert.equal(mistake?.source, 'practice');
  assert.equal(mistake?.userAnswer, 'x=5');
});

test('prepend is newest-first and the badge counts unresolved rows', () => {
  const first = buildQuizMistake({ sessionId: 's1', question: 'Q1', picked: 'A', correct: 'B' });
  const second = buildQuizMistake({ sessionId: 's1', question: 'Q2', picked: 'C', correct: 'D' });
  assert.ok(first && second);
  const list = prependMistake(prependMistake([], first!), second!);
  assert.equal(list[0].questionContent, 'Q2');
  assert.equal(unresolvedMistakeCount(list), 2);
  assert.equal(unresolvedMistakeCount([{ ...first!, isResolved: true }]), 0);
});
