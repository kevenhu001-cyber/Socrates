import assert from 'node:assert/strict';
import test from 'node:test';

import { examActionsOf, examModeOf, examScreenOf } from '../src/exam/screen.ts';

const chrome = {
  cancel: 'Cancel', close: 'Close', generate: 'Generate', submit: 'Submit',
  newExam: 'New exam', tryAgain: 'Try again', back: 'Back',
  addModel: 'Add a model', noQuestions: 'No questions', cancelled: 'Cancelled',
};

function snapshot(overrides = {}) {
  return {
    mode: 'form',
    questions: [],
    answers: {},
    submitted: false,
    readOnly: false,
    topic: '',
    draft: { topic: '', instructions: '', count: 5, model: '', difficulty: 'intermediate', selectedTypes: { mc: true, fb: true, sa: false } },
    progress: { index: 0, total: 1, step: 'preparing' },
    message: '',
    detail: '',
    providers: [],
    current: 0,
    ...overrides,
  };
}

test('mode resolution follows questions, submission and read-only', () => {
  assert.equal(examModeOf(snapshot()), 'form');
  assert.equal(examModeOf(snapshot({ questions: [{ type: 'fill-blank', q: 'Q' }] })), 'questions');
  assert.equal(examModeOf(snapshot({ submitted: true })), 'results');
  assert.equal(examModeOf(snapshot({ submitted: true, readOnly: true })), 'form');
  assert.equal(examModeOf(snapshot({ mode: 'loading' })), 'loading');
  assert.equal(examModeOf(snapshot({ mode: 'cancelled' })), 'cancelled');
});

test('question screens normalise raw questions and keep their original indices', () => {
  const screen = examScreenOf(snapshot({
    questions: [
      { type: 'fill-blank', q: 'First', answers: ['a'] },
      { type: 'error', q: 'failed' },
      { type: 'multiple-choice', q: 'Third', opts: [{ text: 'Yes' }, { text: 'No' }], answer: 'B' },
    ],
    answers: { 2: 1 },
  }), chrome);

  assert.equal(screen.kind, 'questions');
  assert.deepEqual(screen.questions.map((question) => question.index), [0, 2]);
  assert.deepEqual(screen.answered, [2]);
  assert.equal(screen.questions[1].options[0].letter, 'A');
  assert.equal(screen.questions[1].options[1].letter, 'B');
  assert.equal(screen.questions[1].answer, 'B');
});

test('footer actions follow the mode', () => {
  assert.deepEqual(examActionsOf(snapshot(), chrome).map((action) => action.command), ['close', 'generate']);
  assert.deepEqual(examActionsOf(snapshot({ submitted: true }), chrome).map((action) => action.command), ['form', 'close']);
  assert.deepEqual(
    examActionsOf(snapshot({ questions: [{ type: 'fill-blank', q: 'Q' }] }), chrome).map((action) => action.command),
    ['submit', 'close'],
  );
  assert.deepEqual(examActionsOf(snapshot({ readOnly: true }), chrome).map((action) => action.command), ['close']);
});

test('loading screens carry progress and the finishing subtitle', () => {
  const screen = examScreenOf(snapshot({ mode: 'loading', progress: { index: 2, total: 2, step: 'finishing' } }), chrome);
  assert.equal(screen.kind, 'loading');
  assert.equal(screen.percent, 92);
  assert.ok(screen.subtitle.length > 0);
});
