import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectExamLang,
  parseExamArrayJSON,
  parseSingleExamQuestion,
} from '../src/exam/parsing.js';

test('exam prompt language follows the topic script', () => {
  assert.equal(detectExamLang('线性代数'), 'Chinese');
  assert.equal(detectExamLang('ひらがな'), 'Japanese');
  assert.equal(detectExamLang('학습'), 'Korean');
  assert.equal(detectExamLang('linear algebra'), 'English');
});

test('single question parsing removes code fences and thinking markup', () => {
  const question = parseSingleExamQuestion(
    '<think>draft</think>\n```json\n{"q":"What is 2 + 2?","type":"multiple-choice"}\n```',
  );

  assert.deepEqual(question, {
    q: 'What is 2 + 2?',
    type: 'multiple-choice',
    explanation: '',
  });
});

test('single question parsing skips invalid objects and normalizes unknown types', () => {
  const question = parseSingleExamQuestion(
    '```json\n{"notice":"ignore me"}\n{"q":"Complete the sentence.","type":"essay"}\n```',
  );

  assert.deepEqual(question, {
    q: 'Complete the sentence.',
    type: 'fill-blank',
    explanation: '',
  });
});

test('array parsing finds nested JSON in prose without counting braces in strings', () => {
  const result = parseExamArrayJSON(
    'Generated questions: {"questions":[{"q":"Use {x} and [y].","type":"short-answer"}]}',
  );

  assert.deepEqual(result, {
    questions: [{ q: 'Use {x} and [y].', type: 'short-answer' }],
  });
});

test('array parsing accepts a bare array and rejects non-string input', () => {
  assert.deepEqual(parseExamArrayJSON('[{"q":"Q","type":"fill-blank"}]'), {
    questions: [{ q: 'Q', type: 'fill-blank' }],
  });
  assert.equal(parseExamArrayJSON(null), null);
});
