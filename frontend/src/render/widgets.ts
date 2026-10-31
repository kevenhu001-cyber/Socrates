

import { esc } from './helpers.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { createElement } from 'react';
import { mountTutorWidget } from '../react/tutor-widgets/widgetHost.tsx';
import {
  DefinitionWidget,
  DerivationWidget,
  ExampleWidget,
  FlashcardWidget,
  KeyPointWidget,
  PracticeWidget,
  ProofWidget,
  QuizWidget,
  StepListWidget,
  TheoremWidget,
} from '../react/tutor-widgets/InlineTutorWidgets.tsx';
import type {
  ParsedDefinition,
  ParsedDerivation,
  ParsedExample,
  ParsedFlashcard,
  ParsedKeyPoint,
  ParsedPractice,
  ParsedProof,
  ParsedQuiz,
  ParsedTheorem,
} from './widgetParsers.ts';

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
export interface TheoremMountData extends ParsedTheorem { proofTitle?: string; proofBody?: string }
export interface PickedQuizOption { letter: string; text: string }
export interface QuizPickFeedback { feedbackText: string; feedbackClass: string }

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

export function mountExampleWidget(slot: Element, parsed: ParsedExample) {
  const { formatMsg, t } = runtime;
  return mountTutorWidget(slot, 'example', createElement(ExampleWidget, {
    title: parsed.title ? formatMsg(parsed.title) : '',
    problem: parsed.problem ? formatMsg(parsed.problem) : '',
    solution: parsed.solution ? formatMsg(parsed.solution) : '',
    parsed,
    t,
  }));
}

export function mountDefinitionWidget(slot: Element, parsed: ParsedDefinition) {
  return mountTutorWidget(slot, 'definition', createElement(DefinitionWidget, {
    term: parsed.term ? runtime.formatMsg(parsed.term) : '',
    body: parsed.body ? runtime.formatMsg(parsed.body) : '',
  }));
}

export function mountStepList(slot: Element, steps: ParsedStep[]) {
  return mountTutorWidget(slot, 'step-list', createElement(StepListWidget, {
    steps: steps.map((step) => ({ ...step, body: runtime.formatMsg(step.body) })),
  }));
}

export function mountFlashcardWidget(slot: Element, parsed: ParsedFlashcard) {
  return mountTutorWidget(slot, 'flashcard', createElement(FlashcardWidget, {
    front: runtime.formatMsg(parsed.front || ''),
    back: runtime.formatMsg(parsed.back || ''),
    label: runtime.t('tutor.flashcardAria'),
  }));
}

export function mountTheoremWidget(slot: Element, parsed: TheoremMountData) {
  return mountTutorWidget(slot, 'theorem', createElement(TheoremWidget, {
    title: parsed.title ? runtime.formatMsg(parsed.title) : '',
    statement: parsed.statement ? runtime.formatMsg(parsed.statement) : '',
    proofTitle: parsed.proofTitle ? runtime.formatMsg(parsed.proofTitle) : '',
    proofBody: parsed.proofBody ? runtime.formatMsg(parsed.proofBody) : '',
    t: runtime.t,
  }));
}

export function mountProofWidget(slot: Element, parsed: ParsedProof) {
  return mountTutorWidget(slot, 'proof', createElement(ProofWidget, {
    title: parsed.title ? runtime.formatMsg(parsed.title) : '',
    body: parsed.body ? runtime.formatMsg(parsed.body) : '',
  }));
}

export function mountDerivationWidget(slot: Element, parsed: ParsedDerivation) {
  return mountTutorWidget(slot, 'derivation', createElement(DerivationWidget, {
    title: parsed.title ? runtime.formatMsg(parsed.title) : '',
    body: parsed.body ? runtime.formatMsg(parsed.body) : '',
  }));
}

export function mountKeyPointWidget(slot: Element, parsed: ParsedKeyPoint) {
  return mountTutorWidget(slot, 'key-point', createElement(KeyPointWidget, {
    label: runtime.t('tutor.keyPointLabel') || 'Key Point',
    body: runtime.formatMsg(parsed.body),
  }));
}

export function mountPracticeWidget(slot: Element, parsed: PracticeMountData) {
  const { formatMsg, t, submitChatMessage, stateStore, recordMistake } = runtime;
  if (slot?.getAttribute && !parsed.slotId) parsed.slotId = slot.getAttribute('data-practice-id');
  return mountTutorWidget(slot, 'practice', createElement(PracticeWidget, {
    problem: parsed.problem || '',
    hint: parsed.hint || '',
    correct: parsed.correct || '',
    t,
    formatMsg,
    submitChatMessage,
    stateStore,
    recordMistake,
    slotId: parsed.slotId,
  }));
}

export function mountQuizWidget(slot: Element, parsed: QuizMountData) {
  const { formatMsg, handleQuizPick } = runtime;
  if (slot?.getAttribute && !parsed.slotId) parsed.slotId = slot.getAttribute('data-quiz-id');
  return mountTutorWidget(slot, 'quiz', createElement(QuizWidget, {
    question: formatMsg(parsed.q || ''),
    options: (parsed.options || []).map((option) => ({ ...option, html: formatMsg(option.text) })),
    correct: parsed.correct || '',
    handleQuizPick,
    parsed,
    questionLabel: String(parsed.q || ''),
  }));
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

export function handleQuizPick(picked: PickedQuizOption, parsed: QuizMountData): QuizPickFeedback {
  const services = runtime;
  const quizData = parsed;
  const correct = quizData.correct;
  const isRight = Boolean(correct) && picked.letter === correct;
  const feedbackText = correct
    ? services.t(isRight ? 'tutor.quizCorrect' : 'tutor.quizWrong').replace('{answer}', correct)
    : services.t('tutor.quizRecorded').replace('{letter}', picked.letter);
  const feedbackClass = `inline-quiz-feedback${correct ? (isRight ? ' ok' : ' bad') : ''}`;
  recordQuizOutcome(quizData, picked, isRight, services);
  updateQuizStage(services.stateStore, isRight);
  if (!services.shouldRequestTutorAfterQuiz(correct, isRight)) {
    persistQuizOutcome(services);
    return { feedbackText, feedbackClass };
  }
  let text = `I chose ${picked.letter}. ${picked.text}`;
  if (correct) text += ` (Result: ${isRight ? 'correct' : `incorrect, correct is ${correct}`}.)`;
  services.submitChatMessage?.(text, { origin: 'quiz' });
  return { feedbackText, feedbackClass };
}
