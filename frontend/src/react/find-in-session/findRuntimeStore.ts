import type { FindInSessionBridge, FindInSessionSnapshot } from './types';

type Listener = () => void;

const CLOSED: FindInSessionSnapshot = Object.freeze({
  isOpen: false,
  query: '',
  matchCount: 0,
  activeIndex: -1,
});

let snapshot: FindInSessionSnapshot = CLOSED;
const listeners = new Set<Listener>();

function commit(next: FindInSessionSnapshot): void {
  snapshot = Object.freeze({ ...next });
  listeners.forEach((listener) => listener());
}

function getSnapshot(): FindInSessionSnapshot {
  return snapshot;
}

function publish(next: FindInSessionSnapshot): void {
  commit(next);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const bridge: FindInSessionBridge = {
  getSnapshot,
  publish,
  subscribe,
};

/**
 * Idempotent install. Calling this more than once returns the existing
 * bridge so legacy module callbacks that fire before React mounts aren't
 * lost.
 */
export function installFindInSessionBridge(): FindInSessionBridge {
  const existing = window.__socratesFindInSession;
  if (existing) return existing;
  window.__socratesFindInSession = bridge;
  return bridge;
}

export function getFindInSessionSnapshot(): FindInSessionSnapshot {
  return installFindInSessionBridge().getSnapshot();
}

export function subscribeToFindInSession(listener: Listener): () => void {
  return installFindInSessionBridge().subscribe(listener);
}
