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
});
