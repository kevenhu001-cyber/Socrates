import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { configureWidgetRuntime, handleQuizPick, mountPracticeWidget, mountQuizWidget } from '../src/render/widgets.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;
const translations = {
  'tutor.quizCorrect': 'Correct: {answer}',
  'tutor.quizWrong': 'Wrong: {answer}',
  'tutor.quizRecorded': 'Recorded: {letter}',
  'tutor.practicePrefix': 'My answer: ',
};

beforeEach(() => {
  document.body.replaceChildren();
  configureWidgetRuntime({
    formatMsg: (text) => String(text),
    t: (key) => translations[key] || key,
    stateStore: { read: () => undefined },
    handleQuizPick: undefined,
    recordMistake: undefined,
    removeMistakeForQuizSlot: undefined,
    submitChatMessage: undefined,
    updateKB: undefined,
    saveCurrentSession: undefined,
    shouldRequestTutorAfterQuiz: () => false,
  });
});

function slot(kind) {
  const el = document.createElement('div');
  el.setAttribute(`data-${kind}-id`, `${kind}-slot`);
  document.body.appendChild(el);
  return el;
}

function quiz(correct = 'A') {
  mountQuizWidget(slot('quiz'), {
    q: '2 + 2?', options: [{ letter: 'A', text: '4' }, { letter: 'B', text: '5' }], correct,
  });
  return document.querySelector('.inline-quiz');
}

function practice(correct = '42') {
  mountPracticeWidget(slot('practice'), { problem: '6 × 7?', hint: 'Multiply.', correct });
  return document.querySelector('.inline-practice');
}

function teachingStore(stage, attempts, dispatches) {
  return {
    read: (key) => ({ teachingStage: stage, practiceAttempts: attempts })[key],
    dispatch: (action) => dispatches.push(action),
  };
}

test('absent optional services preserve standalone quiz and practice behavior', () => {
  const card = quiz();
  card.querySelector('button').click();
  assert.equal(card.querySelector('button').disabled, false);
  assert.equal(card.querySelector('.inline-quiz-feedback').textContent, '');
  const exercise = practice();
  exercise.querySelector('textarea').value = '42';
  exercise.querySelector('.inline-practice-submit').click();
  assert.equal(exercise.querySelector('.inline-practice-feedback').classList.contains('ok'), true);
});

test('wrong quiz choice marks both options, records the slot and increments attempts', () => {
  const mistakes = [], dispatches = [], persisted = [];
  configureWidgetRuntime({
    handleQuizPick, recordMistake: (entry) => mistakes.push(entry),
    stateStore: teachingStore('exercise', 2, dispatches),
    updateKB: () => persisted.push('kb'), saveCurrentSession: () => persisted.push('session'),
  });
  const card = quiz();
  card.querySelector('[data-letter="B"]').click();
  assert.equal(card.querySelector('[data-letter="B"]').className, 'inline-quiz-opt selected wrong');
  assert.equal(card.querySelector('[data-letter="A"]').classList.contains('correct'), true);
  assert.ok([...card.querySelectorAll('button')].every((button) => button.disabled));
  assert.equal(card.querySelector('.inline-quiz-feedback').textContent, 'Wrong: A');
  assert.equal(mistakes.length, 1);
  assert.deepEqual(mistakes[0], {
    type: 'quiz', q: '2 + 2?', options: [{ letter: 'A', text: '4' }, { letter: 'B', text: '5' }],
    correct: 'A', userAnswer: 'B', quizSlotId: 'quiz-slot',
  });
  assert.deepEqual(dispatches, [{ type: 'state/set', key: 'practiceAttempts', value: 3 }]);
  assert.deepEqual(persisted, ['kb', 'session']);
});

test('correct exercise choice removes its mistake and advances to check', () => {
  const removed = [], dispatches = [];
  configureWidgetRuntime({
    handleQuizPick, removeMistakeForQuizSlot: (id) => removed.push(id),
    stateStore: teachingStore('exercise', 4, dispatches),
  });
  const card = quiz();
  card.querySelector('[data-letter="A"]').click();
  assert.equal(card.querySelector('.inline-quiz-feedback').textContent, 'Correct: A');
  assert.deepEqual(removed, ['quiz-slot']);
  assert.deepEqual(dispatches, [{ type: 'state/batch', patch: { teachingStage: 'check', practiceAttempts: 0 } }]);
});

test('check-stage correct choice resets attempts', () => {
  const dispatches = [];
  configureWidgetRuntime({ handleQuizPick, stateStore: teachingStore('check', 3, dispatches) });
  quiz().querySelector('[data-letter="A"]').click();
  assert.deepEqual(dispatches, [{ type: 'state/set', key: 'practiceAttempts', value: 0 }]);
});

test('tutor follow-up submits grading context and leaves persistence to the turn', () => {
  const submitted = [], persisted = [];
  configureWidgetRuntime({
    handleQuizPick, shouldRequestTutorAfterQuiz: () => true,
    submitChatMessage: (...args) => submitted.push(args),
    updateKB: () => persisted.push('kb'), saveCurrentSession: () => persisted.push('session'),
  });
  quiz().querySelector('[data-letter="B"]').click();
  assert.deepEqual(submitted, [['I chose B. 5 (Result: incorrect, correct is A.)', { origin: 'quiz' }]]);
  assert.deepEqual(persisted, []);
});

test('quiz without an answer records the selection without inventing a correct answer', () => {
  configureWidgetRuntime({ handleQuizPick });
  const card = quiz('');
  card.querySelector('[data-letter="B"]').click();
  assert.equal(card.querySelector('.inline-quiz-feedback').textContent, 'Recorded: B');
  assert.equal(card.querySelector('.inline-quiz-feedback').className, 'inline-quiz-feedback');
});

test('independent persistence failures are reported without losing grading feedback', (context) => {
  const persisted = [], diagnostics = [];
  context.mock.method(console, 'warn', (...args) => diagnostics.push(args));
  configureWidgetRuntime({
    handleQuizPick,
    updateKB: () => { persisted.push('kb'); throw new Error('KB failed'); },
    saveCurrentSession: () => { persisted.push('session'); throw new Error('Session failed'); },
  });
  const card = quiz();
  card.querySelector('[data-letter="A"]').click();
  assert.deepEqual(persisted, ['kb', 'session']);
  assert.deepEqual(diagnostics.map((entry) => entry[1]), ['widgets.quiz.updateKB', 'widgets.quiz.saveCurrentSession']);
  assert.equal(card.querySelector('.inline-quiz-feedback').textContent, 'Correct: A');
});

test('a runtime reconfiguration during recording affects only later answers', () => {
  const dispatches = [], persisted = [];
  configureWidgetRuntime({
    handleQuizPick, stateStore: teachingStore('exercise', 2, dispatches),
    recordMistake: () => configureWidgetRuntime({ stateStore: teachingStore('check', 99, dispatches), updateKB: () => persisted.push('new') }),
    updateKB: () => persisted.push('original'),
  });
  quiz().querySelector('[data-letter="B"]').click();
  assert.deepEqual(dispatches, [{ type: 'state/set', key: 'practiceAttempts', value: 3 }]);
  assert.deepEqual(persisted, ['original']);
});

test('practice validates empty answers and toggles the hint without submitting', () => {
  const submitted = [];
  configureWidgetRuntime({ submitChatMessage: (...args) => submitted.push(args) });
  const card = practice();
  card.querySelector('.inline-practice-submit').click();
  assert.equal(card.querySelector('.inline-practice-feedback').textContent, 'tutor.practiceEmpty');
  assert.equal(card.querySelector('textarea').disabled, false);
  const hint = card.querySelector('.inline-practice-hint');
  assert.equal(hint.hidden, true);
  card.querySelector('.inline-practice-hint-toggle').click();
  assert.equal(hint.hidden, false);
  card.querySelector('.inline-practice-hint-toggle').click();
  assert.equal(hint.hidden, true);
  assert.deepEqual(submitted, []);
});

test('correct practice answer is normalized, sent once, and clears attempts', () => {
  const submitted = [], dispatches = [];
  configureWidgetRuntime({
    submitChatMessage: (...args) => submitted.push(args), stateStore: teachingStore('exercise', 3, dispatches),
  });
  const card = practice('The Answer');
  card.querySelector('textarea').value = ' the answer! ';
  const submit = card.querySelector('.inline-practice-submit');
  submit.click(); submit.click();
  assert.equal(card.querySelector('.inline-practice-feedback').textContent, 'tutor.practiceSelfCorrect');
  assert.deepEqual(submitted, [['My answer: the answer!', { origin: 'practice' }]]);
  assert.deepEqual(dispatches, [{ type: 'state/set', key: 'practiceAttempts', value: 0 }]);
  assert.equal(card.querySelector('.inline-practice-reveal').disabled, true);
});

test('wrong practice answer records the mounted slot', () => {
  const mistakes = [];
  configureWidgetRuntime({ recordMistake: (entry) => mistakes.push(entry) });
  const card = practice();
  card.querySelector('textarea').value = '41';
  card.querySelector('.inline-practice-submit').click();
  assert.deepEqual(mistakes, [{ type: 'practice', q: '6 × 7?', options: [], correct: '42', userAnswer: '41', judgedAnswer: '42', practiceSlotId: 'practice-slot' }]);
});

test('practice reveal disables grading and does not send a chat message', () => {
  const submitted = [];
  configureWidgetRuntime({ submitChatMessage: (...args) => submitted.push(args) });
  const card = practice();
  card.querySelector('.inline-practice-reveal').click();
  assert.equal(card.querySelector('.inline-practice-feedback').textContent, '42');
  assert.equal(card.querySelector('textarea').disabled, true);
  assert.equal(card.querySelector('.inline-practice-submit').disabled, true);
  assert.deepEqual(submitted, []);
});

test('practice without an answer key sends the response for tutor grading', () => {
  const submitted = [];
  configureWidgetRuntime({ submitChatMessage: (...args) => submitted.push(args) });
  const card = practice('');
  card.querySelector('textarea').value = 'My explanation';
  card.querySelector('.inline-practice-submit').click();
  assert.equal(card.querySelector('.inline-practice-reveal'), null);
  assert.equal(card.querySelector('.inline-practice-feedback').textContent, 'tutor.practiceSent');
  assert.deepEqual(submitted, [['My answer: My explanation', { origin: 'practice' }]]);
});
