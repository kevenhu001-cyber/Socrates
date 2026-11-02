/* Tutor scaffold mounts (RN-3). Each slot is replaced by an owned React root
 * that renders the shared React Native scaffold through react-native-web.
 * Side effects (grading, mistake book, tutor follow-ups) live in
 * widgetRuntime.ts; this chunk stays lazy (see widgetScheduler.ts). */
import { createElement, type ReactElement } from 'react';
import { mountTutorWidget } from '../react/tutor-widgets/widgetHost.tsx';
import {
  DefinitionScaffold,
  DerivationScaffold,
  ExampleScaffold,
  FlashcardScaffold,
  KeyPointScaffold,
  LearnMount,
  PracticeScaffold,
  ProofScaffold,
  QuizScaffold,
  StepListScaffold,
  TheoremScaffold,
} from '../react/tutor-widgets/LearnScaffolds.tsx';
import { isSharedMessageList } from '../ui/msgListMount.ts';
import type { ParsedDefinition, ParsedDerivation, ParsedExample, ParsedFlashcard, ParsedKeyPoint, ParsedProof } from '@socrates/ui/learn-model';
import type { ParsedStep, PracticeMountData, QuizMountData, TheoremMountData } from './widgetRuntime.ts';

export { configureWidgetRuntime, handleQuizPick } from './widgetRuntime.ts';
export type { WidgetRuntime, QuizMountData, PracticeMountData, ParsedStep, TheoremMountData, PickedQuizOption, QuizPickFeedback } from './widgetRuntime.ts';

/** Public share pages (and any shared transcript host) render scaffolds read-only. */
function isReadOnlySlot(slot: Element): boolean {
  const list = slot.closest?.('#msgList');
  if (list instanceof HTMLElement && isSharedMessageList(list)) return true;
  try {
    return new URLSearchParams(window.location.search).has('share');
  } catch (_) {
    return false;
  }
}

function mount(slot: Element, kind: string, card: ReactElement) {
  return mountTutorWidget(slot, kind, createElement(LearnMount, { readOnly: isReadOnlySlot(slot) }, card));
}

export function mountExampleWidget(slot: Element, parsed: ParsedExample) {
  return mount(slot, 'example', createElement(ExampleScaffold, { parsed }));
}

export function mountDefinitionWidget(slot: Element, parsed: ParsedDefinition) {
  return mount(slot, 'definition', createElement(DefinitionScaffold, { parsed }));
}

export function mountStepList(slot: Element, steps: ParsedStep[]) {
  return mount(slot, 'step', createElement(StepListScaffold, { steps }));
}

export function mountFlashcardWidget(slot: Element, parsed: ParsedFlashcard) {
  return mount(slot, 'flashcard', createElement(FlashcardScaffold, { parsed }));
}

export function mountTheoremWidget(slot: Element, parsed: TheoremMountData) {
  return mount(slot, 'theorem', createElement(TheoremScaffold, { parsed }));
}

export function mountProofWidget(slot: Element, parsed: ParsedProof) {
  return mount(slot, 'proof', createElement(ProofScaffold, { parsed }));
}

export function mountDerivationWidget(slot: Element, parsed: ParsedDerivation) {
  return mount(slot, 'derivation', createElement(DerivationScaffold, { parsed }));
}

export function mountKeyPointWidget(slot: Element, parsed: ParsedKeyPoint) {
  return mount(slot, 'key-point', createElement(KeyPointScaffold, { parsed }));
}

export function mountPracticeWidget(slot: Element, parsed: PracticeMountData) {
  if (slot?.getAttribute && !parsed.slotId) parsed.slotId = slot.getAttribute('data-practice-id');
  return mount(slot, 'practice', createElement(PracticeScaffold, { parsed }));
}

export function mountQuizWidget(slot: Element, parsed: QuizMountData) {
  if (slot?.getAttribute && !parsed.slotId) parsed.slotId = slot.getAttribute('data-quiz-id');
  return mount(slot, 'quiz', createElement(QuizScaffold, { parsed }));
}
