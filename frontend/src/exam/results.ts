import type { ExamResults } from '@socrates/ui/exam-model';
import { examResults } from '@socrates/ui/exam-model';
import type { ExamQuestion } from './types.ts';
import { toExamAnswers, toExamQuestions } from './adapt.ts';
import { examUiL } from './ui.ts';

/** Results page data. The shared model owns grading and row building; this
 *  keeps the SPA signature (raw questions + position-keyed answers). */
export function buildExamResultsSnapshot(
  questions: ExamQuestion[],
  answers: Record<number, string | number | undefined>,
  translate: typeof examUiL = examUiL,
): ExamResults {
  return examResults(toExamQuestions(questions), toExamAnswers(answers), translate);
}
