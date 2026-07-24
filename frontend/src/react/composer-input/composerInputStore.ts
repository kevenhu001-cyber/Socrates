import type { ComposerInputBridge, ComposerInputSnapshot } from './types';

type Listener = () => void;

const INITIAL_SNAPSHOT: ComposerInputSnapshot = Object.freeze({
  topicInput: '',
  chatInput: '',
  hasAttachments: false,
  isStreaming: false,
  isTopicSetup: true,
  reasoningEffort: 'medium',
  revision: 0,
});

let snapshot: ComposerInputSnapshot = INITIAL_SNAPSHOT;
const listeners = new Set<Listener>();

function commit(next: Omit<ComposerInputSnapshot, 'revision'>): void {
  snapshot = Object.freeze({
    ...next,
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

function getSnapshot(): ComposerInputSnapshot {
  return snapshot;
}

function publish(next: Omit<ComposerInputSnapshot, 'revision'>): void {
  commit(next);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const bridge: ComposerInputBridge = {
  getSnapshot,
  publish,
  subscribe,
};

export function installComposerInputBridge(): ComposerInputBridge {
  const existing = window.__socratesComposerInputBridge;
  if (existing) return existing;
  window.__socratesComposerInputBridge = bridge;
  return bridge;
}

export function getComposerInputSnapshot(): ComposerInputSnapshot {
  return installComposerInputBridge().getSnapshot();
}

export function subscribeToComposerInput(listener: Listener): () => void {
  return installComposerInputBridge().subscribe(listener);
}
