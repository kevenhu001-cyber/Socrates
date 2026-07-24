import type {
  ComposerToolsBridge,
  ComposerToolsSnapshot,
} from './types';

type Listener = () => void;

const HIDDEN: ComposerToolsSnapshot = Object.freeze({
  isOpen: false,
  mode: null,
  triggerId: null,
  revision: 0,
});

let snapshot: ComposerToolsSnapshot = HIDDEN;
const listeners = new Set<Listener>();

function commit(next: Omit<ComposerToolsSnapshot, 'revision'>): void {
  snapshot = Object.freeze({
    ...next,
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

export function installComposerToolsBridge(): ComposerToolsBridge {
  const existing = window.__socratesComposerToolsBridge;
  if (existing) return existing;
  const bridge: ComposerToolsBridge = {
    getSnapshot: () => snapshot,
    publish: commit,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  window.__socratesComposerToolsBridge = bridge;
  return bridge;
}

export function getComposerToolsSnapshot(): ComposerToolsSnapshot {
  return installComposerToolsBridge().getSnapshot();
}

export function subscribeToComposerTools(listener: Listener): () => void {
  return installComposerToolsBridge().subscribe(listener);
}