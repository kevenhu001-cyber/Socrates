import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackDiagnosticQuestions,
  clampTutorQuestionCount,
  shouldRequestTutorAfterQuiz,
  shouldAutoSearchTutor,
} from '../src/tutor/policy.js';

test('tutor question count is clamped to 1..10', () => {
  assert.equal(clampTutorQuestionCount(0), 1);
  assert.equal(clampTutorQuestionCount('7'), 7);
  assert.equal(clampTutorQuestionCount(99), 10);
  assert.equal(clampTutorQuestionCount('bad'), 5);
});

test('stable textbook topics do not trigger tutor background search', () => {
  assert.equal(shouldAutoSearchTutor('复变函数是什么'), false);
  assert.equal(shouldAutoSearchTutor('Explain the chain rule'), false);
  assert.equal(shouldAutoSearchTutor('今天的黄金价格是多少'), true);
  assert.equal(shouldAutoSearchTutor('Search the web for the latest React release'), true);
});

test('fallback diagnostic honors requested count and stays multiple choice', () => {
  const questions = buildFallbackDiagnosticQuestions('复变函数', 10, true);
  assert.equal(questions.length, 10);
  assert.ok(questions.every((question) => question.opts.length === 4));
});

test('Tutor quiz requests AI only after a wrong self-graded choice', () => {
  assert.equal(shouldRequestTutorAfterQuiz('B', true), false);
  assert.equal(shouldRequestTutorAfterQuiz('B', false), true);
  assert.equal(shouldRequestTutorAfterQuiz('', false), false);
});
