import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExamResultsSnapshot } from '../src/exam/results.ts';

test('exam result model grades supported question types and omits failed cards', () => {
  const result = buildExamResultsSnapshot([
    {
      type: 'multiple-choice',
      q: 'Which option is correct?',
      opts: [{ letter: 'A', text: 'No' }, { letter: 'B', text: 'Yes' }],
      answer: 'B',
    },
    { type: 'fill-blank', q: 'Four is ____.', answers: ['four'] },
    { type: 'short-answer', q: 'Name the theorem.', answer: 'spectral theorem' },
    { type: 'error', q: 'Failed generation' },
  ], {
    0: 1,
    1: ' FOUR ',
    2: 'The spectral theorem applies.',
  }, (english) => english);

  assert.deepEqual(
    { correct: result.correct, total: result.total, percent: result.percent },
    { correct: 3, total: 3, percent: 100 },
  );
  assert.equal(result.questions[0].options[1].isSelected, true);
  assert.equal(result.questions[1].expectedAnswer, 'four');
});

test('exam result model hands raw text to the view so `$…$` can be typeset there', () => {
  const result = buildExamResultsSnapshot([
    {
      type: 'multiple-choice',
      q: '  $f(x)=x^2$ 在 $x=1$ 处的导数是？ ',
      opts: [{ letter: 'A', text: '$2$' }, { letter: 'B', text: '<b>1</b>' }],
      answer: 'A',
      explanation: '由 $f\'(x)=2x$ 得 $f\'(1)=2$。',
    },
  ], { 0: 0 }, (english) => english);
  const question = result.questions[0];
  assert.equal(question.questionText, '$f(x)=x^2$ 在 $x=1$ 处的导数是？');
  assert.equal(question.options[0].text, '$2$');
  assert.equal(question.options[1].text, '<b>1</b>');
  assert.equal(question.explanationText, '由 $f\'(x)=2x$ 得 $f\'(1)=2$。');
  assert.equal('questionHtml' in question, false);
});
