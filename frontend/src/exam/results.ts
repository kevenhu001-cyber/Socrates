import type { ExamQuestion } from "./types.ts";
import type { ExamResultsSnapshot, ExamResultQuestion } from '../react/exam/ExamResults.tsx';
import { formatMsg } from '../render/markdown.ts';
import { examUiL } from './ui.ts';


function resultTypeLabel(type: string, translate: (en: string, zh: string) => string) {
  const labels: Record<string, string> = {
    'multiple-choice': translate('Multiple choice', '选择题'),
    'fill-blank': translate('Fill blank', '填空题'),
    'short-answer': translate('Short answer', '简答题'),
  };
  return labels[type] || type;
}

type ScorableExamQuestion = ExamQuestion & { type: Exclude<ExamQuestion['type'], 'error'> };

function isScorableExamQuestion(question: ExamQuestion): question is ScorableExamQuestion {
  return question.type !== 'error';
}

function gradeExamQuestion(question: ExamQuestion, answer: string | number | undefined) {
  if (question.type === 'multiple-choice') {
    const selected = answer;
    return selected !== undefined && question.opts?.[Number(selected)]?.letter === question.answer;
  }
  if (question.type === 'fill-blank') {
    const submitted = String(answer || '').trim().toLowerCase();
    return (question.answers || []).some((candidate) => submitted === candidate.trim().toLowerCase());
  }
  if (question.type === 'short-answer') {
    const submitted = String(answer || '').trim().toLowerCase();
    const expected = String(question.answer || '').trim().toLowerCase();
    const keywords = expected.split(/[,\s]+/).filter((keyword) => keyword.length > 3);
    return keywords.length === 0 || keywords.some((keyword) => submitted.includes(keyword));
  }
  return false;
}

function resultQuestion(question: ScorableExamQuestion, answer: string | number | undefined, isCorrect: boolean, translate: typeof examUiL): ExamResultQuestion {
  const options = question.type === 'multiple-choice'
    ? (question.opts || []).map((option, index) => ({
      letter: option.letter || '',
      html: formatMsg(option.text || ''),
      isCorrect: option.letter === question.answer,
      isSelected: answer === index,
    }))
    : [];
  const isFillBlank = question.type === 'fill-blank';
  return {
    type: question.type,
    typeLabel: resultTypeLabel(question.type, translate),
    questionLabel: translate('Question', '题目'),
    questionHtml: formatMsg(question.q),
    answer: typeof answer === 'string' ? answer : '',
    options,
    isCorrect,
    statusLabel: isCorrect ? translate('Correct', '正确') : translate('Incorrect', '错误'),
    expectedLabel: isFillBlank ? translate('Correct answer', '正确答案') : translate('Expected', '期望答案'),
    expectedAnswer: isFillBlank ? (question.answers || []).join(', ') : String(question.answer || ''),
    explanationLabel: translate('Explanation', '解释'),
    explanationHtml: question.explanation ? formatMsg(question.explanation) : '',
  };
}

export function buildExamResultsSnapshot(
  questions: ExamQuestion[],
  answers: Record<number, string | number | undefined>,
  translate: typeof examUiL = examUiL,
): ExamResultsSnapshot {
  let correct = 0;
  const details: ReturnType<typeof resultQuestion>[] = [];
  questions.forEach((question, index) => {
    if (!isScorableExamQuestion(question)) return;
    const answer = answers[index];
    const isCorrect = gradeExamQuestion(question, answer);
    if (isCorrect) correct++;
    details.push(resultQuestion(question, answer, isCorrect, translate));
  });
  const total = details.length;
  return {
    correct,
    total,
    percent: total > 0 ? Math.round(correct / total * 100) : 0,
    correctLabel: translate('correct', '正确'),
    questions: details,
  };
}
