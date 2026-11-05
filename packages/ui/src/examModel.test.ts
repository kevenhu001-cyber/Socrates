import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createExamDraft, detectExamLanguage, examAnsweredIndices, examAnswersOf, examAnswerValue,
  examGenerationPrompt, examProgress, examPromptTypes, examQuestionFromRaw, examQuestionsFromRaw,
  examResults, examTypesOf, gradeExam, missingExamAnswers, parseExamQuestionResponse, parseExamQuestions,
} from './examModel.ts';

const data = {
  questions: [
    { q: '2 + 2 = ?', type: 'multiple-choice', opts: [{ letter: 'A', text: '3' }, { letter: 'B', text: '4' }], answer: 'B', explanation: 'Basic addition.' },
    { q: 'The capital of France is ____.', type: 'fill-blank', answers: ['Paris'], explanation: '' },
    { q: 'Explain photosynthesis.', type: 'short-answer', answer: 'chlorophyll, sunlight', explanation: 'Plants convert light.' },
    { q: '[failed]', type: 'error' },
  ],
  answers: { 0: 'B' } as Record<string, string>,
  submitted: false,
};

test('exam questions parse tolerantly and skip error cards', () => {
  const questions = parseExamQuestions(data);
  assert.equal(questions.length, 3);
  assert.deepEqual(questions.map((q) => q.index), [0, 1, 2]);
  assert.deepEqual(questions.map((q) => q.type), ['multiple-choice', 'fill-blank', 'short-answer']);
  assert.equal(questions[0].options[1].text, '4');
  assert.equal(parseExamQuestions(null).length, 0);
  assert.equal(parseExamQuestions({ questions: [{ type: 'weird' }, null, { q: 'ok', type: 'weird' }] }).length, 1);
});

test('answers parse to integer keys and progress reports gaps', () => {
  const questions = parseExamQuestions(data);
  const answers = examAnswersOf(data);
  assert.deepEqual(answers, { 0: 'B' });
  assert.deepEqual(examProgress(questions, answers), { answered: 1, total: 3 });
  assert.deepEqual(missingExamAnswers(questions, answers), [1, 2]);
  const full = { 0: 1, 1: 'Paris', 2: 'chlorophyll plants' };
  assert.deepEqual(missingExamAnswers(questions, full), []);
});

test('grading mirrors the web baseline rules', () => {
  const questions = parseExamQuestions(data);
  const grade = gradeExam(questions, { 0: 1, 1: ' paris ', 2: 'It uses chlorophyll.' });
  assert.equal(grade.correct, 3);
  assert.equal(grade.percent, 100);
  assert.deepEqual(grade.results, { 0: true, 1: true, 2: true });
  const wrong = gradeExam(questions, { 0: 0, 1: 'London', 2: 'No idea' });
  assert.equal(wrong.correct, 0);
  assert.equal(wrong.percent, 0);
  assert.deepEqual(wrong.results, { 0: false, 1: false, 2: false });
});

test('grading tolerates letter answers and empty short-answer keys', () => {
  const questions = parseExamQuestions(data);
  assert.equal(gradeExam([questions[0]], { 0: 'B' }).correct, 1);
  assert.equal(gradeExam([questions[0]], { 0: 'b' }).correct, 1);
  assert.equal(gradeExam([{ ...questions[2], answer: '' }], { 2: 'anything' }).correct, 1);
  assert.equal(gradeExam([questions[1]], { 1: 'PARIS' }).correct, 1);
});

test('answer values normalize per question type', () => {
  const questions = parseExamQuestions(data);
  assert.equal(examAnswerValue(questions[0], 'B'), 1);
  assert.equal(examAnswerValue(questions[1], ' Paris '), ' Paris ');
  assert.equal(examAnswerValue(questions[0], undefined), undefined);
});

test('prompt language follows the topic script', () => {
  assert.equal(detectExamLanguage('细胞生物学'), 'Chinese');
  assert.equal(detectExamLanguage('せんけいだいすう'), 'Japanese');
  assert.equal(detectExamLanguage('линейная алгебра'), 'Russian');
  assert.equal(detectExamLanguage('linear algebra'), 'English');
  assert.equal(detectExamLanguage(''), 'English');
});

test('prompt types keep canonical cycle order and default to all', () => {
  assert.deepEqual(examPromptTypes(['short-answer', 'multiple-choice']), ['multiple-choice', 'short-answer']);
  assert.deepEqual(examPromptTypes([]), ['multiple-choice', 'fill-blank', 'short-answer']);
});

test('the generation prompt carries the question index, topic and prior questions', () => {
  const prompt = examGenerationPrompt({ topic: 'Cell biology', index: 1, count: 3, difficulty: 'hard', type: 'fill-blank', lang: 'English', previousPrompts: ['What is a cell?'] });
  assert.match(prompt, /This is question 2 of 3\./);
  assert.match(prompt, /Topic: Cell biology\./);
  assert.match(prompt, /Question type: fill-blank\./);
  assert.match(prompt, /1\. What is a cell\?/);
  assert.match(prompt, /Only the JSON|ONLY the JSON/);
});

test('model answers parse through fences, thinking and prose', () => {
  const wrapped = 'Sure!\n```json\n{"q":"What is 2 + 2?","type":"multiple-choice","opts":[{"letter":"A","text":"4"},{"text":"3"}],"answer":"A","explanation":"add"}\n```\n';
  const parsed = parseExamQuestionResponse(wrapped, 4);
  assert.ok(parsed);
  assert.equal(parsed.index, 4);
  assert.equal(parsed.prompt, 'What is 2 + 2?');
  assert.equal(parsed.options[1].letter, 'B');
  assert.equal(parsed.answer, 'A');
  const thinking = '{"q":"Q","type":"bogus"}';
  assert.equal(parseExamQuestionResponse(`<thinking>ignore {}</thinking>${thinking}`, 0)?.type, 'fill-blank');
  assert.equal(parseExamQuestionResponse('no json here', 0), null);
  assert.equal(parseExamQuestionResponse('{"q":"","type":"fill-blank"}', 0), null);
});

test('raw questions keep the caller index and drop error placeholders', () => {
  const question = examQuestionFromRaw({ q: 'Q', type: 'fill-blank', answers: ['a'] }, 7);
  assert.equal(question?.index, 7);
  assert.equal(examQuestionFromRaw({ q: '[failed]', type: 'error' }, 0), null);
  assert.equal(examQuestionFromRaw({ q: '', type: 'fill-blank' }, 0), null);
  assert.equal(examQuestionFromRaw(null, 0), null);
  const questions = examQuestionsFromRaw([{ q: 'A', type: 'fill-blank' }, { q: 'B', type: 'error' }, { q: 'C', type: 'fill-blank' }]);
  assert.deepEqual(questions.map((entry) => entry.index), [0, 2]);
});

test('answered indices follow question order', () => {
  const questions = parseExamQuestions(data);
  assert.deepEqual(examAnsweredIndices(questions, { 0: 1, 2: 'x' }), [0, 2]);
  assert.deepEqual(examAnsweredIndices(questions, { 0: '' }), []);
});

test('results rows carry the host labels and grading verdicts', () => {
  const questions = parseExamQuestions(data);
  const copy = (en: string) => en;
  const results = examResults(questions, { 0: 1, 1: 'Paris', 2: 'no idea' }, copy);
  assert.equal(results.correct, 2);
  assert.equal(results.total, 3);
  assert.equal(results.percent, 67);
  assert.equal(results.correctLabel, 'correct');
  assert.equal(results.questions[0].statusLabel, 'Correct');
  assert.equal(results.questions[0].options[1].isSelected, true);
  assert.equal(results.questions[0].options[1].isCorrect, true);
  assert.equal(results.questions[1].expectedAnswer, 'Paris');
  assert.equal(results.questions[2].statusLabel, 'Incorrect');
  assert.equal(results.questions[2].explanationLabel, 'Explanation');
});

test('draft defaults merge partial overrides and map to prompt types', () => {
  const draft = createExamDraft();
  assert.equal(draft.count, 5);
  assert.deepEqual(draft.selectedTypes, { mc: true, fb: true, sa: false });
  const patched = createExamDraft({ topic: 'Algebra', selectedTypes: { sa: true } });
  assert.equal(patched.topic, 'Algebra');
  assert.deepEqual(patched.selectedTypes, { mc: true, fb: true, sa: true });
  assert.deepEqual(examTypesOf(draft.selectedTypes), ['multiple-choice', 'fill-blank']);
  assert.deepEqual(examTypesOf({ mc: false, fb: false, sa: false }), ['multiple-choice', 'fill-blank', 'short-answer']);
});

