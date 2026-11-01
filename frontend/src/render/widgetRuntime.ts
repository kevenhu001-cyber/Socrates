/* Tutor scaffold side effects: quiz grading + mistake book + teaching stage,
 * practice self-check + chat submission. Kept apart from the RN mounts in
 * widgets.ts so the behaviour stays unit-testable without a renderer. */
import { esc } from './helpers.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { formatAnswerKey, parseAnswerKey, type ParsedQuiz, type ParsedPractice } from '@socrates/ui/learn-model';

export interface WidgetRuntime {
  formatMsg: typeof import('./markdown.ts')['formatMsg'];
  t: (key: string) => string;
  esc: typeof esc;
  stateStore: typeof import('../state/store.ts')['stateStore'];
  shouldRequestTutorAfterQuiz: typeof import('../tutor/policy.ts')['shouldRequestTutorAfterQuiz'];
  submitChatMessage?: typeof import('../chat/sendPipeline.ts')['submitChatMessage'];
  recordMistake?: (entry: Record<string, unknown>) => void;
  removeMistakeForQuizSlot?: (slotId: string) => void;
  handleQuizPick?: (picked: PickedQuizOption, parsed: QuizMountData) => QuizPickFeedback | Promise<QuizPickFeedback>;
  saveCurrentSession?: typeof import('../session/persistence.ts')['saveCurrentSession'];
}

export type QuizMountData = ParsedQuiz;
export type PracticeMountData = Pick<ParsedPractice, 'problem'> & Partial<ParsedPractice> & { slotId?: string | null; correct?: string };
export interface ParsedStep { n: number; body: string }
export interface TheoremMountData { title: string; statement: string; proofTitle?: string; proofBody?: string }
/** `letter` is one letter, or the sorted letters ("AC") of a multi-answer pick. */
export interface PickedQuizOption { letter: string; text: string }
export interface QuizPickFeedback {
  feedbackText: string;
  /** Historical class string (`inline-quiz-feedback ok|bad`). */
  feedbackClass: string;
  verdict?: 'correct' | 'incorrect' | 'recorded';
}

let runtime: WidgetRuntime = {
  formatMsg: (value) => String(value ?? ''),
  t: (key) => key,
  esc,
  stateStore: { read: () => undefined } as unknown as WidgetRuntime['stateStore'],
  shouldRequestTutorAfterQuiz: (..._args: unknown[]) => false,
};

export function configureWidgetRuntime(nextRuntime: Partial<WidgetRuntime>) {
  runtime = { ...runtime, ...nextRuntime };
}

export function widgetRuntime(): WidgetRuntime {
  return runtime;
}

function recordQuizOutcome(parsed: QuizMountData, picked: PickedQuizOption, isRight: boolean, services: WidgetRuntime) {
  if (parsed.correct && !isRight) {
    services.recordMistake?.({ type: 'quiz', q: parsed.q, options: parsed.options.map((option) => ({ letter: option.letter, text: option.text })), correct: parsed.correct, userAnswer: picked.letter, quizSlotId: parsed.slotId || null });
  } else if (isRight && parsed.slotId) {
    services.removeMistakeForQuizSlot?.(parsed.slotId);
  }
}

function updateQuizStage(stateStore: WidgetRuntime['stateStore'], isRight: boolean) {
  const stage = stateStore.read('teachingStage');
  if (stage === 'exercise') {
    stateStore.dispatch?.(isRight
      ? { type: 'state/batch', patch: { teachingStage: 'check', practiceAttempts: 0 } }
      : { type: 'state/set', key: 'practiceAttempts', value: (stateStore.read('practiceAttempts') || 0) + 1 });
  } else if (stage === 'check') {
    stateStore.dispatch?.({ type: 'state/set', key: 'practiceAttempts', value: isRight ? 0 : (stateStore.read('practiceAttempts') || 0) + 1 });
  }
}

function persistQuizOutcome(services: WidgetRuntime) {
  // The React knowledge panel subscribes to the KB store; only persistence
  // remains an explicit side effect here.
  try { services.saveCurrentSession?.(); }
  catch (error) { reportSwallow(error, 'widgets.quiz.saveCurrentSession'); }
}

/** Grade one quiz submission and run its side effects (mistake book, stage, tutor follow-up). */
export function handleQuizPick(picked: PickedQuizOption, parsed: QuizMountData): QuizPickFeedback {
  const services = runtime;
  const key = parseAnswerKey(parsed.correct);
  const correct = key.join('');
  const shown = formatAnswerKey(key);
  const isRight = Boolean(correct) && parseAnswerKey(picked.letter).join('') === correct;
  const feedbackText = correct
    ? services.t(isRight ? 'tutor.quizCorrect' : 'tutor.quizWrong').replace('{answer}', shown)
    : services.t('tutor.quizRecorded').replace('{letter}', formatAnswerKey(parseAnswerKey(picked.letter)) || picked.letter);
  const feedbackClass = `inline-quiz-feedback${correct ? (isRight ? ' ok' : ' bad') : ''}`;
  const verdict = correct ? (isRight ? 'correct' : 'incorrect') : 'recorded';
  recordQuizOutcome(parsed, picked, isRight, services);
  updateQuizStage(services.stateStore, isRight);
  if (!services.shouldRequestTutorAfterQuiz(correct || null, isRight)) {
    persistQuizOutcome(services);
    return { feedbackText, feedbackClass, verdict };
  }
  let text = `I chose ${picked.letter}. ${picked.text}`;
  if (correct) text += ` (Result: ${isRight ? 'correct' : `incorrect, correct is ${correct}`}.)`;
  services.submitChatMessage?.(text, { origin: 'quiz' });
  return { feedbackText, feedbackClass, verdict };
}

export type PracticeFeedbackState = '' | 'bad' | 'recorded' | 'ok';
export interface PracticeFeedback { state: PracticeFeedbackState; text: string; rich?: string }

export function normalizePracticeAnswer(value: string) {
  return value.toLowerCase().replace(/[\s.,;:!?()[\]'"]+/g, '').trim();
}

/**
 * Practice submission: empty answers are refused locally; otherwise the
 * answer goes to the tutor once, and a declared key self-grades it
 * (attempts reset on a match, mistake recorded on a miss).
 */
export function submitPracticeAnswer(parsed: PracticeMountData, answer: string): PracticeFeedback {
  const { t, submitChatMessage, stateStore, recordMistake } = runtime;
  const submitted = String(answer || '').trim();
  if (!submitted) return { state: 'bad', text: t('tutor.practiceEmpty') };
  submitChatMessage?.(t('tutor.practicePrefix') + submitted, { origin: 'practice' });
  const correct = parsed.correct || '';
  if (!correct) return { state: 'recorded', text: t('tutor.practiceSent') };
  const isCorrect = normalizePracticeAnswer(submitted) === normalizePracticeAnswer(correct);
  if (isCorrect) {
    stateStore.dispatch?.({ type: 'state/set', key: 'practiceAttempts', value: 0 });
  } else {
    recordMistake?.({ type: 'practice', q: parsed.problem, options: [], correct, userAnswer: submitted, judgedAnswer: correct, practiceSlotId: parsed.slotId || null });
  }
  return {
    state: isCorrect ? 'ok' : 'bad',
    text: isCorrect ? t('tutor.practiceSelfCorrect') : `${t('tutor.practiceSelfWrong')} ${correct}`,
  };
}

/** Reveal the declared answer: shown as markdown, nothing is sent or recorded. */
export function revealPracticeAnswer(parsed: PracticeMountData): PracticeFeedback {
  return { state: 'recorded', text: '', rich: parsed.correct || '' };
}
