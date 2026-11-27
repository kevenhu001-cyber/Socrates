import { useSyncExternalStore, type ReactNode } from 'react';
import { closeOtherPanels, registerExclusivePanel } from '../lib/exclusivePanel';

export interface ThoughtsPanelEntry {
  /** Stable id of the turn whose reasoning/tool timeline is displayed. */
  key: string;
  title: string;
  durationLabel?: string;
  content: ReactNode;
}

export interface ThoughtsPanelState {
  isOpen: boolean;
  entry: ThoughtsPanelEntry | null;
}

let state: ThoughtsPanelState = { isOpen: false, entry: null };
let opener: HTMLElement | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function openThoughts(entry: ThoughtsPanelEntry, trigger?: HTMLElement | null): void {
  closeOtherPanels('thoughts');
  opener =
    trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  state = { isOpen: true, entry };
  emit();
}

export function toggleThoughts(entry: ThoughtsPanelEntry, trigger?: HTMLElement | null): void {
  if (state.isOpen && state.entry?.key === entry.key) {
    closeThoughts();
    return;
  }
  openThoughts(entry, trigger);
}

/** Keeps the open sheet synchronized while steps or tools arrive live. */
export function updateThoughts(entry: ThoughtsPanelEntry): void {
  if (!state.isOpen || state.entry?.key !== entry.key) return;
  state = { isOpen: true, entry };
  emit();
}

export function closeThoughts(): void {
  if (!state.isOpen) return;
  const target = opener;
  opener = null;
  state = { isOpen: false, entry: state.entry };
  emit();
  if (target?.isConnected) target.focus({ preventScroll: true });
}

export function closeThoughtsIfKey(key: string): void {
  if (!state.isOpen || state.entry?.key !== key) return;
  opener = null;
  state = { isOpen: false, entry: null };
  emit();
}

registerExclusivePanel('thoughts', closeThoughts);

export function getThoughtsPanelState(): ThoughtsPanelState {
  return state;
}

export function subscribeThoughtsPanel(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useThoughtsPanel(): ThoughtsPanelState {
  return useSyncExternalStore(subscribeThoughtsPanel, getThoughtsPanelState);
}
