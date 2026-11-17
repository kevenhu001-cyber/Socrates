import { useSyncExternalStore } from 'react';

export interface SourcesPanelItem {
  id: string;
  title: string;
  url: string;
  host: string;
  snippet?: string;
  date?: string;
  source?: string;
}

export interface SourcesPanelEntry {
  /** Stable id of the answer or tool run that owns these sources. */
  key: string;
  title: string;
  items: SourcesPanelItem[];
}

export interface SourcesPanelState {
  isOpen: boolean;
  entry: SourcesPanelEntry | null;
}

let state: SourcesPanelState = { isOpen: false, entry: null };
let opener: HTMLElement | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function openSources(entry: SourcesPanelEntry, trigger?: HTMLElement | null): void {
  opener =
    trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  state = { isOpen: true, entry };
  emit();
}

export function closeSources(): void {
  if (!state.isOpen) return;
  const target = opener;
  opener = null;
  state = { isOpen: false, entry: state.entry };
  emit();
  /* Return focus to the answer's sources button, not to a panel that is
     hidden in the same commit. */
  if (target?.isConnected) target.focus();
}

export function getSourcesPanelState(): SourcesPanelState {
  return state;
}

export function subscribeSourcesPanel(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSourcesPanel(): SourcesPanelState {
  return useSyncExternalStore(subscribeSourcesPanel, getSourcesPanelState);
}
