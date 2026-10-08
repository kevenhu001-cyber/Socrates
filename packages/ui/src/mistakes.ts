import type { Mistake } from '@socrates/contracts';

/** Mistake-book record builders (DOM-free). Mirror the baseline
 * `ui/mistakeBook.js recordMistake` contract: a wrong quiz pick with a
 * declared answer and an incorrect practice attempt land in the book.
 * Hosts own storage (session `mistakes` array); this module only builds
 * well-formed rows and reads them back. */

export interface QuizMistakeInput {
  sessionId: string;
  nodeName?: string | null;
  question: string;
  options?: string[];
  picked: string;
  pickedText?: string | null;
  correct: string | null;
}

export interface PracticeMistakeInput {
  sessionId: string;
  nodeName?: string | null;
  problem: string;
  answer: string;
  correct: string | null;
}

function baseId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Record condition shared with the synthetic-turn gate: a correct answer
 * is declared and the pick is wrong. Returns null when nothing lands. */
export function buildQuizMistake(input: QuizMistakeInput): Mistake | null {
  if (!input.correct || input.picked === input.correct) return null;
  const now = new Date().toISOString();
  return {
    id: baseId(),
    sessionId: input.sessionId,
    nodeName: input.nodeName || null,
    questionContent: input.question,
    userAnswer: input.pickedText ? `${input.picked}. ${input.pickedText}` : input.picked,
    correctAnswer: input.correct,
    source: 'quiz',
    isResolved: false,
    collectedAt: now,
    resolvedAt: null,
  };
}

/** Incorrect practice attempts land in the book the same way. A submission
 * without a declared correct answer cannot be judged, so it never lands. */
export function buildPracticeMistake(input: PracticeMistakeInput): Mistake | null {
  if (!input.correct || input.answer === input.correct) return null;
  const now = new Date().toISOString();
  return {
    id: baseId(),
    sessionId: input.sessionId,
    nodeName: input.nodeName || null,
    questionContent: input.problem,
    userAnswer: input.answer,
    correctAnswer: input.correct,
    source: 'practice',
    isResolved: false,
    collectedAt: now,
    resolvedAt: null,
  };
}

/** Newest-first prepend shared with the baseline (`[mistake].concat(list)`). */
export function prependMistake(list: Mistake[], mistake: Mistake): Mistake[] {
  return [mistake, ...list];
}

/** Unresolved count drives the tab badge (baseline `updateMistakesBadge`). */
export function unresolvedMistakeCount(list: Mistake[]): number {
  return list.filter((mistake) => !mistake.isResolved && !(mistake as { resolved?: unknown }).resolved).length;
}
