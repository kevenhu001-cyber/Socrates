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
