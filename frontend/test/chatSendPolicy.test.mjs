import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countsTowardTutorProgress,
  isSubstantiveTutorAnswer,
  nextTutorStage,
  stuckPromptTransition,
  tutorNodeProgressDecision,
} from '../src/chat/send/tutorPolicy.ts';

const substantiveAnswer = 'A thoughtful answer with enough detail to show how this idea works and why it matters.';

test('tutor progress counts detailed free-form answers but excludes quiz and practice origins', () => {
  assert.equal(isSubstantiveTutorAnswer(substantiveAnswer), true);
  assert.equal(isSubstantiveTutorAnswer('short answer'), false);
  assert.equal(countsTowardTutorProgress(substantiveAnswer, undefined), true);
  assert.equal(countsTowardTutorProgress(substantiveAnswer, 'quiz'), false);
  assert.equal(countsTowardTutorProgress(substantiveAnswer, 'practice'), false);
  assert.equal(countsTowardTutorProgress(substantiveAnswer, 'hint'), false);
});

test('detailed CJK answers count without whitespace while brief replies do not', () => {
  const answer = '导数表示函数在某一点附近的瞬时变化率，可以通过割线斜率的极限来理解，它不是简单地把函数值除以自变量。';
  assert.equal(isSubstantiveTutorAnswer(answer), true);
  assert.equal(countsTowardTutorProgress(answer), true);
  assert.equal(isSubstantiveTutorAnswer('我不知道'), false);
  assert.equal(isSubstantiveTutorAnswer('这是一个很短的回答'), false);
  assert.equal(isSubstantiveTutorAnswer(' '.repeat(60)), false);
});

test('teaching stages advance one step per substantive answer and stop at check', () => {
  assert.equal(nextTutorStage('motivate', true), 'define');
  assert.equal(nextTutorStage('illustrate', true), 'exercise');
  assert.equal(nextTutorStage('exercise', true, 'practice'), 'check');
  assert.equal(nextTutorStage('define', true, 'quiz'), null);
  assert.equal(nextTutorStage('define', true, 'hint'), null);
  assert.equal(nextTutorStage('check', true), null);
  assert.equal(nextTutorStage('define', false), null);
});

test('node completion requires depth, exercise stage, and a free-form turn', () => {
  const ready = { node: { name: 'Fractions' }, substantiveCount: 3, teachingStage: 'exercise' };
  assert.equal(tutorNodeProgressDecision(ready), true);
  assert.equal(tutorNodeProgressDecision({ ...ready, substantiveCount: 2 }), false);
  assert.equal(tutorNodeProgressDecision({ ...ready, teachingStage: 'illustrate' }), false);
  assert.equal(tutorNodeProgressDecision({ ...ready, origin: 'quiz' }), false);
  assert.equal(tutorNodeProgressDecision({ ...ready, node: null }), false);
});

test('stuck prompt escalation offers help, tracks rejection, and resets after four options', () => {
  assert.deepEqual(stuckPromptTransition({ stuckCount: 2, offered: false, rejected: 0 }), {
    action: 'take-time', patch: null,
  });
  assert.deepEqual(stuckPromptTransition({ stuckCount: 3, offered: false, rejected: 0 }), {
    action: 'explain-prompt', patch: { stuckCheckOffered: true, stuckCount: 0 },
  });
  assert.deepEqual(stuckPromptTransition({ stuckCount: 3, offered: true, rejected: 0 }), {
    action: 'take-time', patch: { stuckCheckRejected: 1, stuckCount: 0 },
  });
  assert.deepEqual(stuckPromptTransition({ stuckCount: 3, offered: true, rejected: 1 }), {
    action: 'four-options', patch: { stuckCount: 0, stuckCheckOffered: false, stuckCheckRejected: 0 },
  });
});
