import type {
  ShareBridge,
  ShareSnapshot,
  ShareVisibility,
} from './types';

type Listener = () => void;

const HIDDEN: ShareSnapshot = Object.freeze({
  isOpen: false,
  visibility: 'public',
  shareToken: null,
  shareUrl: '',
  status: '',
  error: '',
  revision: 0,
});

let snapshot: ShareSnapshot = HIDDEN;
const listeners = new Set<Listener>();

function commit(next: Omit<ShareSnapshot, 'revision'>): void {
  snapshot = Object.freeze({
    ...next,
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

function getSnapshot(): ShareSnapshot {
  return snapshot;
}

function publish(next: Omit<ShareSnapshot, 'revision'>): void {
  commit(next);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const bridge: ShareBridge = {
  getSnapshot,
  publish,
  subscribe,
};

export function installShareBridge(): ShareBridge {
  const existing = window.__socratesShareBridge;
  if (existing) return existing;
  window.__socratesShareBridge = bridge;
  return bridge;
}

export function getShareSnapshot(): ShareSnapshot {
  return installShareBridge().getSnapshot();
}

export function subscribeToShare(listener: Listener): () => void {
  return installShareBridge().subscribe(listener);
}
