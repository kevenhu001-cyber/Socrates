import type { CheatsheetBridge, CheatsheetSnapshot } from './types';

type Listener = () => void;

const INITIAL: CheatsheetSnapshot = { open: false, revision: 0 };

let snapshot: CheatsheetSnapshot = INITIAL;
const listeners = new Set<Listener>();

function commit(next: Omit<CheatsheetSnapshot, 'revision'>): void {
  snapshot = { ...next, revision: snapshot.revision + 1 };
  listeners.forEach((l) => l());
}

function getSnapshot(): CheatsheetSnapshot { return snapshot; }
function publish(next: Omit<CheatsheetSnapshot, 'revision'>): void { commit(next); }
function subscribe(listener: Listener): () => void { listeners.add(listener); return () => listeners.delete(listener); }

const bridge: CheatsheetBridge = { getSnapshot, publish, subscribe };

export function installCheatsheetBridge(): CheatsheetBridge {
  const existing = window.__socratesCheatsheetBridge;
  if (existing) return existing;
  window.__socratesCheatsheetBridge = bridge;
  return bridge;
}

export function getCheatsheetSnapshot(): CheatsheetSnapshot { return installCheatsheetBridge().getSnapshot(); }
export function subscribeToCheatsheet(listener: Listener): () => void { return installCheatsheetBridge().subscribe(listener); }
