/* SPA ↔ shared exam model adapter.
 *
 * The SPA stores questions in their generated shape (`q` / `opts` / `_idx`) and
 * keys answers by array position. The shared model normalises that to
 * `prompt` / `options` / `index`. Keep every conversion here: `navigation.ts`
 * and `persistence.ts` must not learn the shared shape.
 */
import type { ExamAnswers, ExamQuestion } from '@socrates/ui/exam-model';
import { examQuestionsFromRaw } from '@socrates/ui/exam-model';
import type { ExamQuestion as RawExamQuestion } from './types.ts';

/** Raw questions keep their array position: answers are keyed by it, and
 *  `_idx` is written from that same position (generation.ts / loader.impl.ts). */
export function toExamQuestions(raw: readonly RawExamQuestion[]): ExamQuestion[] {
  return examQuestionsFromRaw(raw);
}

export function toExamAnswers(
  answers: Record<string | number, string | number | undefined> | null | undefined,
): ExamAnswers {
  const out: ExamAnswers = {};
  if (!answers) return out;
  for (const [key, value] of Object.entries(answers)) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    if (typeof value === 'string' || typeof value === 'number') out[index] = value;
  }
  return out;
}
