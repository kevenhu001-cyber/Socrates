

import { esc } from './helpers.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { createElement } from 'react';
import { mountTutorWidget } from '../react/tutor-widgets/widgetHost.tsx';
import { ExampleWidget, FlashcardWidget, PracticeWidget, QuizWidget, TheoremWidget } from '../react/tutor-widgets/InlineTutorWidgets.tsx';
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
  handleQuizPick?: typeof handleQuizPick;
  updateKB?: typeof import('../ui/knowledgePanel.ts')['updateKB'];
  saveCurrentSession?: typeof import('../session/persistence.ts')['saveCurrentSession'];
}

export type QuizMountData = ParsedQuiz;
export type PracticeMountData = Pick<ParsedPractice, 'problem'> & Partial<ParsedPractice> & { slotId?: string | null; correct?: string };
export interface ParsedStep { n: number; body: string }
export interface TheoremMountData extends ParsedTheorem { proofTitle?: string; proofBody?: string }
export interface PickedQuizOption { letter: string; text: string; html?: string }

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
  const el = document.createElement('div'); el.className = 'inline-definition';
  if (parsed.term) { const node = document.createElement('div'); node.className = 'inline-definition-term'; node.innerHTML = runtime.formatMsg(parsed.term); el.appendChild(node); }
  if (parsed.body) { const node = document.createElement('div'); node.className = 'inline-definition-body'; node.innerHTML = runtime.formatMsg(parsed.body); el.appendChild(node); }
  slot.replaceWith(el);
}

export function mountStepList(slot: Element, steps: ParsedStep[]) {
  const el = document.createElement('div'); el.className = 'inline-step-list';
  steps.forEach((step) => { const row = document.createElement('div'); row.className = 'inline-step'; const number = document.createElement('span'); number.className = 'inline-step-n'; number.textContent = `${step.n}.`; const body = document.createElement('div'); body.className = 'inline-step-body'; body.innerHTML = runtime.formatMsg(step.body); row.append(number, body); el.appendChild(row); });
  slot.replaceWith(el);
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

export function mountProofWidget(slot: Element, parsed: ParsedProof) { const el = document.createElement('div'); el.className = 'inline-proof'; if (parsed.title) { const node = document.createElement('div'); node.className = 'inline-proof-title'; node.innerHTML = runtime.formatMsg(parsed.title); el.appendChild(node); } if (parsed.body) { const node = document.createElement('div'); node.className = 'inline-proof-body'; node.innerHTML = runtime.formatMsg(parsed.body); el.appendChild(node); } slot.replaceWith(el); }
export function mountDerivationWidget(slot: Element, parsed: ParsedDerivation) { const el = document.createElement('div'); el.className = 'inline-derivation'; if (parsed.title) { const node = document.createElement('div'); node.className = 'inline-derivation-title'; node.innerHTML = runtime.formatMsg(parsed.title); el.appendChild(node); } if (parsed.body) { const node = document.createElement('div'); node.className = 'inline-derivation-body'; node.innerHTML = runtime.formatMsg(parsed.body); el.appendChild(node); } slot.replaceWith(el); }
export function mountKeyPointWidget(slot: Element, parsed: ParsedKeyPoint) { const el = document.createElement('div'); el.className = 'inline-key-point'; const label = document.createElement('div'); label.className = 'inline-key-point-label'; label.textContent = runtime.t('tutor.keyPointLabel') || 'Key Point'; const body = document.createElement('div'); body.className = 'inline-key-point-body'; body.innerHTML = runtime.formatMsg(parsed.body); el.append(label, body); slot.replaceWith(el); }

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

function showQuizFeedback(feedback: HTMLDivElement, buttons: HTMLButtonElement[], picked: PickedQuizOption, correct: string | null, isRight: boolean, services: WidgetRuntime) {
  const { t, esc: escape } = services;
  buttons.forEach((button) => { button.disabled = true; });
  const chosen = buttons.find((button) => button.getAttribute('data-letter') === picked.letter);
  chosen?.classList.add('selected');
  chosen?.classList.add(isRight ? 'correct' : 'wrong');
  if (correct && !isRight) buttons.find((button) => button.getAttribute('data-letter') === correct)?.classList.add('correct');
  if (correct) feedback.classList.add(isRight ? 'ok' : 'bad');
  feedback.textContent = correct
    ? (isRight ? t('tutor.quizCorrect') : t('tutor.quizWrong')).replace('{answer}', escape(correct))
    : t('tutor.quizRecorded').replace('{letter}', picked.letter);
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
  // These writes are independent: a KB failure must not prevent saving the
  // session, and neither failure should discard the feedback already shown.
  try { services.updateKB?.(); }
  catch (error) { reportSwallow(error, 'widgets.quiz.updateKB'); }
  try { services.saveCurrentSession?.(); }
  catch (error) { reportSwallow(error, 'widgets.quiz.saveCurrentSession'); }
}

export function handleQuizPick(card: HTMLDivElement, options: HTMLDivElement, feedback: HTMLDivElement, buttons: HTMLButtonElement[], picked: PickedQuizOption, parsed: QuizMountData) {
  const services = runtime;
  const quizData = parsed;
  const correct = quizData.correct;
  const isRight = Boolean(correct) && picked.letter === correct;
  showQuizFeedback(feedback, buttons, picked, correct, isRight, services);
  recordQuizOutcome(quizData, picked, isRight, services);
  updateQuizStage(services.stateStore, isRight);
  if (!services.shouldRequestTutorAfterQuiz(correct, isRight)) {
    persistQuizOutcome(services);
    return;
  }
  let text = `I chose ${picked.letter}. ${picked.text}`;
  if (correct) text += ` (Result: ${isRight ? 'correct' : `incorrect, correct is ${correct}`}.)`;
  services.submitChatMessage?.(text, { origin: 'quiz' });
}
