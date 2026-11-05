import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  configureWidgetRuntime, handleQuizPick, revealPracticeAnswer, submitPracticeAnswer,
} from '../src/render/widgetRuntime.ts';

/*
 * RN-3: the scaffold cards are React Native (packages/ui/src/learn, state in
 * learnModel.test.ts); their side effects live in render/widgetRuntime.ts and
 * are exercised here directly, the way the mounted cards call them.
 */
const translations = {
  'tutor.quizCorrect': 'Correct: {answer}',
  'tutor.quizWrong': 'Wrong: {answer}',
  'tutor.quizRecorded': 'Recorded: {letter}',
  'tutor.practicePrefix': 'My answer: ',
  'tutor.quizChose': 'I chose {letter}. {text}',
  'tutor.quizChoseResultCorrect': ' (Result: correct.)',
  'tutor.quizChoseResultWrong': ' (Result: incorrect, correct is {answer}.)',
};
const zhTranslations = {
  ...translations,
  'tutor.quizChose': '我选了 {letter}。{text}',
  'tutor.quizChoseResultCorrect': '（结果：正确。）',
  'tutor.quizChoseResultWrong': '（结果：错误，正确答案是 {answer}。）',
};

beforeEach(() => {
  configureWidgetRuntime({
    formatMsg: (text) => String(text),
    t: (key) => translations[key] || key,
    stateStore: { read: () => undefined },
    handleQuizPick: undefined,
    recordMistake: undefined,
    removeMistakeForQuizSlot: undefined,
    submitChatMessage: undefined,
    saveCurrentSession: undefined,
    shouldRequestTutorAfterQuiz: () => false,
  });
});

const QUIZ = () => ({ q: '2 + 2?', options: [{ letter: 'A', text: '4' }, { letter: 'B', text: '5' }], correct: 'A', slotId: 'quiz-slot' });
const pick = (letter, parsed = QUIZ()) => handleQuizPick({ letter, text: parsed.options.find((o) => o.letter === letter)?.text || '' }, parsed);
const PRACTICE = (correct = '42') => ({ problem: '6 × 7?', hint: 'Multiply.', correct, slotId: 'practice-slot' });

function teachingStore(stage, attempts, dispatches) {
  return {
    read: (key) => ({ teachingStage: stage, practiceAttempts: attempts })[key],
    dispatch: (action) => dispatches.push(action),
  };
}

test('absent optional services still grade quiz and practice without side effects', () => {
  assert.deepEqual(pick('A'), { feedbackText: 'Correct: A', feedbackClass: 'inline-quiz-feedback ok', verdict: 'correct' });
  assert.equal(submitPracticeAnswer(PRACTICE(), '42').state, 'ok');
});

test('wrong quiz choice records the slot, increments attempts and persists', () => {
  const mistakes = [], dispatches = [], persisted = [];
  configureWidgetRuntime({
    recordMistake: (entry) => mistakes.push(entry),
    stateStore: teachingStore('exercise', 2, dispatches),
    saveCurrentSession: () => persisted.push('session'),
  });
  const feedback = pick('B');
  assert.equal(feedback.feedbackText, 'Wrong: A');
  assert.equal(feedback.verdict, 'incorrect');
  assert.deepEqual(mistakes, [{
    type: 'quiz', q: '2 + 2?', options: [{ letter: 'A', text: '4' }, { letter: 'B', text: '5' }],
    correct: 'A', userAnswer: 'B', quizSlotId: 'quiz-slot',
  }]);
  assert.deepEqual(dispatches, [{ type: 'state/set', key: 'practiceAttempts', value: 3 }]);
  assert.deepEqual(persisted, ['session']);
});

test('correct exercise choice removes its mistake and advances to check', () => {
  const removed = [], dispatches = [];
  configureWidgetRuntime({ removeMistakeForQuizSlot: (id) => removed.push(id), stateStore: teachingStore('exercise', 4, dispatches) });
  assert.equal(pick('A').feedbackText, 'Correct: A');
  assert.deepEqual(removed, ['quiz-slot']);
  assert.deepEqual(dispatches, [{ type: 'state/batch', patch: { teachingStage: 'check', practiceAttempts: 0 } }]);
});

test('check-stage correct choice resets attempts', () => {
  const dispatches = [];
  configureWidgetRuntime({ stateStore: teachingStore('check', 3, dispatches) });
  pick('A');
  assert.deepEqual(dispatches, [{ type: 'state/set', key: 'practiceAttempts', value: 0 }]);
});

test('tutor follow-up submits grading context and leaves persistence to the turn', () => {
  const submitted = [], persisted = [];
  configureWidgetRuntime({
    shouldRequestTutorAfterQuiz: () => true,
    submitChatMessage: (...args) => submitted.push(args),
    saveCurrentSession: () => persisted.push('session'),
  });
  pick('B');
  assert.deepEqual(submitted, [['I chose B. 5 (Result: incorrect, correct is A.)', { origin: 'quiz' }]]);
  assert.deepEqual(persisted, []);
});

test('tutor follow-up is written in the interface language', () => {
  const submitted = [];
  configureWidgetRuntime({
    t: (key) => zhTranslations[key] || key,
    shouldRequestTutorAfterQuiz: () => true,
    submitChatMessage: (...args) => submitted.push(args),
  });
  pick('B');
  pick('A');
  assert.deepEqual(submitted, [
    ['我选了 B。5（结果：错误，正确答案是 A。）', { origin: 'quiz' }],
    ['我选了 A。4（结果：正确。）', { origin: 'quiz' }],
  ]);
});

test('quiz without an answer records the selection without inventing a correct answer', () => {
  const feedback = pick('B', { ...QUIZ(), correct: null });
  assert.equal(feedback.feedbackText, 'Recorded: B');
  assert.equal(feedback.feedbackClass, 'inline-quiz-feedback');
  assert.equal(feedback.verdict, 'recorded');
});

test('multi-answer quiz grades the whole set and records the joined pick', () => {
  const mistakes = [];
  configureWidgetRuntime({ recordMistake: (entry) => mistakes.push(entry) });
  const parsed = { q: 'Odd?', options: [{ letter: 'A', text: '1' }, { letter: 'B', text: '2' }, { letter: 'C', text: '3' }], correct: 'AC', multi: true, slotId: 'm' };
  assert.equal(handleQuizPick({ letter: 'CA', text: '3; 1' }, parsed).verdict, 'correct');
  const wrong = handleQuizPick({ letter: 'A', text: '1' }, parsed);
  assert.equal(wrong.feedbackText, 'Wrong: A, C');
  assert.equal(mistakes[0].userAnswer, 'A');
  assert.equal(mistakes[0].correct, 'AC');
});

test('session persistence failure is reported without losing grading feedback', (context) => {
  const persisted = [], diagnostics = [];
  context.mock.method(console, 'warn', (...args) => diagnostics.push(args));
  configureWidgetRuntime({ saveCurrentSession: () => { persisted.push('session'); throw new Error('Session failed'); } });
  assert.equal(pick('A').feedbackText, 'Correct: A');
  assert.deepEqual(persisted, ['session']);
  assert.deepEqual(diagnostics.map((entry) => entry[1]), ['widgets.quiz.saveCurrentSession']);
});

test('a runtime reconfiguration during recording affects only later answers', () => {
  const dispatches = [];
  configureWidgetRuntime({
    stateStore: teachingStore('exercise', 2, dispatches),
    recordMistake: () => configureWidgetRuntime({ stateStore: teachingStore('check', 99, dispatches) }),
  });
  pick('B');
  assert.deepEqual(dispatches, [{ type: 'state/set', key: 'practiceAttempts', value: 3 }]);
});

test('practice refuses empty answers without submitting', () => {
  const submitted = [];
  configureWidgetRuntime({ submitChatMessage: (...args) => submitted.push(args) });
  assert.deepEqual(submitPracticeAnswer(PRACTICE(), '   '), { state: 'bad', text: 'tutor.practiceEmpty' });
  assert.deepEqual(submitted, []);
});

test('correct practice answer is normalized, sent once, and clears attempts', () => {
  const submitted = [], dispatches = [];
  configureWidgetRuntime({ submitChatMessage: (...args) => submitted.push(args), stateStore: teachingStore('exercise', 3, dispatches) });
  const feedback = submitPracticeAnswer(PRACTICE('The Answer'), ' the answer! ');
  assert.deepEqual(feedback, { state: 'ok', text: 'tutor.practiceSelfCorrect' });
  assert.deepEqual(submitted, [['My answer: the answer!', { origin: 'practice' }]]);
  assert.deepEqual(dispatches, [{ type: 'state/set', key: 'practiceAttempts', value: 0 }]);
});

test('equivalent fraction and decimal answers self-check as correct', () => {
  const submitted = [], dispatches = [];
  configureWidgetRuntime({ submitChatMessage: (...args) => submitted.push(args), stateStore: teachingStore('exercise', 3, dispatches) });
  const feedback = submitPracticeAnswer(PRACTICE('0.5'), '1/2');
  assert.deepEqual(feedback, { state: 'ok', text: 'tutor.practiceSelfCorrect' });
  assert.deepEqual(submitted, [['My answer: 1/2', { origin: 'practice' }]]);
  assert.deepEqual(dispatches, [{ type: 'state/set', key: 'practiceAttempts', value: 0 }]);
});

test('unsupported algebra is sent for review rather than recorded as a mistake', () => {
  const submitted = [], mistakes = [], dispatches = [];
  configureWidgetRuntime({
    submitChatMessage: (...args) => submitted.push(args),
    recordMistake: (entry) => mistakes.push(entry),
    stateStore: teachingStore('exercise', 2, dispatches),
  });
  const feedback = submitPracticeAnswer(PRACTICE('x=2'), 'x^2=4');
  assert.deepEqual(feedback, { state: 'recorded', text: 'tutor.practiceSent' });
  assert.deepEqual(submitted, [['My answer: x^2=4', { origin: 'practice' }]]);
  assert.deepEqual(mistakes, []);
  assert.deepEqual(dispatches, []);
});

test('wrong practice answer records the mounted slot', () => {
  const mistakes = [];
  configureWidgetRuntime({ recordMistake: (entry) => mistakes.push(entry) });
  assert.equal(submitPracticeAnswer(PRACTICE(), '41').state, 'bad');
  assert.deepEqual(mistakes, [{ type: 'practice', q: '6 × 7?', options: [], correct: '42', userAnswer: '41', judgedAnswer: '42', practiceSlotId: 'practice-slot' }]);
});

test('practice reveal shows the key as markdown and sends nothing', () => {
  const submitted = [];
  configureWidgetRuntime({ submitChatMessage: (...args) => submitted.push(args) });
  assert.deepEqual(revealPracticeAnswer(PRACTICE()), { state: 'recorded', text: '', rich: '42' });
  assert.deepEqual(submitted, []);
});

test('practice without an answer key sends the response for tutor grading', () => {
  const submitted = [];
  configureWidgetRuntime({ submitChatMessage: (...args) => submitted.push(args) });
  assert.deepEqual(submitPracticeAnswer(PRACTICE(''), 'My explanation'), { state: 'recorded', text: 'tutor.practiceSent' });
  assert.deepEqual(submitted, [['My answer: My explanation', { origin: 'practice' }]]);
});
