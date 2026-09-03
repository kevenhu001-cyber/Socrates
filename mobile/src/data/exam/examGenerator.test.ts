import { gradeExam, parseExamQuestion } from './examGenerator';

describe('exam generator contracts', () => {
  it('extracts a question from fenced model output', () => {
    const question = parseExamQuestion('Here you go:\n```json\n{"q":"2 + 2?","type":"multiple-choice","opts":[{"letter":"A","text":"4"}],"answer":"A"}\n```');
    expect(question?.q).toBe('2 + 2?');
    expect(question?.type).toBe('multiple-choice');
    expect(question?.answer).toBe('A');
  });

  it('grades choice, fill, and short answers consistently', () => {
    const result = gradeExam([
      { q: 'choice', type: 'multiple-choice', answer: 'B' },
      { q: 'fill', type: 'fill-blank', answers: ['photosynthesis'] },
      { q: 'short', type: 'short-answer', answer: 'natural selection' },
    ], { 0: 'B', 1: 'photosynthesis', 2: 'Natural selection explains adaptation' });
    expect(result.correct).toBe(3);
    expect(result.results.every((item) => item.correct)).toBe(true);
  });

  it('grades short answers by keyword overlap like frontend exam.js', () => {
    /* frontend `exam.js:992-996`: keywords = expected split on [,\\s]+
     * keeping len>3; correct when empty or any keyword in the answer. */
    const qs = [{ q: 'short', type: 'short-answer' as const, answer: 'natural selection' }];
    expect(gradeExam(qs, { 0: 'selection pressures differ' }).results[0].correct).toBe(true);
    expect(gradeExam(qs, { 0: 'unrelated response here' }).results[0].correct).toBe(false);
    expect(gradeExam(qs, { 0: '' }).results[0].correct).toBe(false);
  });
});
