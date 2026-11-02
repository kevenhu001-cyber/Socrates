/**
 * RN-4 — question chain state for the web shell. The chain is the learner's
 * line of thought in one tutor session: the topic as its root, then every
 * question they chose to follow from the chain. The shared model
 * (packages/ui/src/think/model.ts) owns the rules; this file binds them to
 * the current session and lets React roots subscribe.
 */
import { EMPTY_CHAIN, appendChainStep, appendOwnQuestion, looksLikeQuestion, seedChain, type ChainState } from '@socrates/ui/think-model';
import { stateStore } from '../state/store.ts';
import { getAppMode } from '../config/providers.ts';

let chain: ChainState = EMPTY_CHAIN;
const listeners = new Set<() => void>();

function publish(next: ChainState): void {
  if (next === chain) return;
  chain = next;
  listeners.forEach((listener) => listener());
}

function firstUserText(): string {
  const messages = stateStore.read('messages') as ReadonlyArray<{ role?: string; rawText?: string }> | undefined;
  const first = messages?.find((message) => message.role === 'user' && typeof message.rawText === 'string' && message.rawText.trim());
  return first?.rawText ?? '';
}

function sessionRoot(): string {
  const topic = stateStore.read('topic');
  const text = typeof topic === 'string' ? topic.trim() : '';
  return text || firstUserText();
}

/** Bind the chain to the current session (a new session starts a new chain). */
export function syncQuestionChain(): ChainState {
  const sessionKey = (stateStore.read('currentSessionId') as string | null | undefined) ?? null;
  publish(seedChain(chain, sessionKey, sessionRoot()));
  return chain;
}

/** Record that the learner followed `text` down the chain. */
export function followQuestionChain(text: string): void {
  publish(appendChainStep(syncQuestionChain(), text));
}

/**
 * RN-14: a question the learner typed in the composer joins the chain as
 * "You asked". Tutor only (the chain is a tutor surface), and only text
 * that reads as a question: most learner messages in a tutor session are
 * answers to the tutor's own question.
 */
export function noteOwnQuestion(text: string): void {
  if (getAppMode() !== 'tutor' || !looksLikeQuestion(text)) return;
  publish(appendOwnQuestion(syncQuestionChain(), text));
}

export function getQuestionChain(): ChainState {
  return chain;
}

export function subscribeQuestionChain(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam. */
export function resetQuestionChainForTests(): void {
  chain = EMPTY_CHAIN;
  listeners.clear();
}
