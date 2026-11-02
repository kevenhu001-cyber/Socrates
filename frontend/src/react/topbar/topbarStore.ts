/**
 * RN-7 — header state that legacy modules used to write straight into the
 * DOM (`#shareBtn.hidden`, `#findBtn.hidden`, `shareBtn.style.display`).
 * They now publish here and the React top bar renders from it.
 */
import { useSyncExternalStore } from 'react';

export interface TopbarState {
  /** Share and find are offered: signed in, with a session or exam on screen. */
  readonly conversationActions: boolean;
  /** A read-only shared conversation is open: no share action. */
  readonly sharedView: boolean;
}

let state: TopbarState = { conversationActions: false, sharedView: false };
const listeners = new Set<() => void>();

export function readTopbarState(): TopbarState {
  return state;
}

export function setTopbarState(patch: Partial<TopbarState>): void {
  const next = { ...state, ...patch };
  if (next.conversationActions === state.conversationActions && next.sharedView === state.sharedView) return;
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useTopbarState(): TopbarState {
  return useSyncExternalStore(subscribe, readTopbarState, readTopbarState);
}
