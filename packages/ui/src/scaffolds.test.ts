import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePracticeInner, parseQuizInner, practiceAnswerMatches, splitTutorScaffolds } from './scaffolds.ts';

test('quiz inner parses question, options and the declared answer', () => {
  const quiz = parseQuizInner('<q>What is 2+2?</q><o letter="A">3</o><o letter="B">4</o><correct>B</correct>')!;
  assert.equal(quiz.q, 'What is 2+2?');
  assert.deepEqual(quiz.options.map((o) => `${o.letter}:${o.text}`), ['A:3', 'B:4']);
  assert.equal(quiz.correct, 'B');
  assert.equal(parseQuizInner('<q>No options</q>'), null);
  assert.equal(parseQuizInner('<o letter="A">x</o><o letter="B">y</o>'), null);
});

test('practice inner keeps markdown fields and defaults the title', () => {
  const practice = parsePracticeInner('<problem>Solve $x^2=4$</problem><hint>Take roots</hint>', 'x=2')!;
  assert.equal(practice.title, 'Practice');
  assert.equal(practice.problem, 'Solve $x^2=4$');
  assert.equal(practice.hint, 'Take roots');
  assert.equal(practice.correct, 'x=2');
  assert.equal(parsePracticeInner('<hint>only a hint</hint>'), null);
});

test('self-check normalization ignores case, spacing and punctuation', () => {
  assert.equal(practiceAnswerMatches(' X = 2. ', 'x=2'), true);
  assert.equal(practiceAnswerMatches('x=3', 'x=2'), false);
});

test('first quiz and practice become widgets; extras degrade to prose', () => {
  const segments = splitTutorScaffolds(
    'Intro\n<quiz><q>Q1?</q><o letter="A">a</o><o letter="B">b</o></quiz>\nmid\n<quiz><q>Q2?</q><o letter="A">a</o><o letter="B">b</o></quiz>\noutro',
  );
  assert.deepEqual(segments.map((s) => s.kind), ['text', 'quiz', 'text', 'text', 'text']);
  const extra = segments[3];
  assert.equal(extra.kind === 'text' ? extra.text : '', 'Q2?');

  const practice = splitTutorScaffolds(
    '<practice correct="x=2"><problem>P1</problem></practice><practice><problem>P2</problem></practice>',
  );
  assert.deepEqual(practice.map((s) => s.kind), ['practice', 'text']);
  const first = practice[0];
  assert.equal(first.kind === 'practice' ? first.practice.correct : null, 'x=2');
});

test('malformed blocks fall back and do not consume the widget slot', () => {
  const segments = splitTutorScaffolds(
    '<quiz><q>bad has options but no o tags</q></quiz><quiz><q>Good?</q><o letter="A">a</o><o letter="B">b</o></quiz>',
  );
  assert.deepEqual(segments.map((s) => s.kind), ['fallback', 'quiz']);
});

test('text without scaffolds passes through unchanged', () => {
  const segments = splitTutorScaffolds('Just prose with <b>html</b>.');
  assert.deepEqual(segments, [{ kind: 'text', text: 'Just prose with <b>html</b>.' }]);
});
