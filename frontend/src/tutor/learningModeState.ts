/**
 * RN-6 — the selected learning mode as plain state, kept apart from
 * learningMode.ts (which also drives the composer and side panels) so the
 * request layer can read it without pulling UI modules into the send path.
 *
 * The mode travels to the server on every tutor turn as `learningMode`; the
 * server-owned prompt for that mode decides what the model does.
 */
import {
  DEFAULT_LEARNING_MODE,
  isLearningModeId,
  type LearningModeId,
} from '@socrates/ui/think-model';
import { getAppMode } from '../config/providers.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

const STORAGE_KEY = 'socrates-learning-mode';

/** Every id the server accepts: the five selectable modes plus `practice`
 * (the knowledge map's per-node action, never a persisted choice). */
export type TurnLearningMode = LearningModeId | 'practice';

function readStored(): LearningModeId {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLearningModeId(value) ? value : DEFAULT_LEARNING_MODE;
  } catch (_) {
    return DEFAULT_LEARNING_MODE;
  }
}

let current: LearningModeId = readStored();
const listeners = new Set<() => void>();

export function getLearningMode(): LearningModeId {
  return current;
}

export function subscribeLearningMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLearningMode(id: LearningModeId): void {
  if (id === current) return;
  current = id;
  try { localStorage.setItem(STORAGE_KEY, id); }
  catch (error) { reportSwallow(error, 'tutor/learningModeState.persist'); }
  listeners.forEach((listener) => listener());
}

export interface LearningTurnOptions {
  learningMode?: TurnLearningMode;
  learningFocus?: string;
}

/**
 * Stream options for one tutor turn: the current mode (or an explicit one
 * for a single turn) and an optional focus. Outside Tutor mode the turn
 * carries no mode at all, so chat replies never get learning blocks.
 */
export function learningTurnOptions(override?: LearningTurnOptions | null): LearningTurnOptions {
  if (getAppMode() !== 'tutor') return {};
  const out: LearningTurnOptions = { learningMode: override?.learningMode ?? current };
  const focus = override?.learningFocus?.trim();
  if (focus) out.learningFocus = focus.slice(0, 2000);
  return out;
}
