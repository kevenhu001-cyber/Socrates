import type { SessionListBridge, SessionListSnapshot } from './types';

type Listener = () => void;

const INITIAL_SNAPSHOT: SessionListSnapshot = Object.freeze({
  sessions: [],
  currentSessionId: null,
  searchQuery: '',
  filter: null,
  fetchFailed: false,
  revision: 0,
});

let snapshot: SessionListSnapshot = INITIAL_SNAPSHOT;
const listeners = new Set<Listener>();

function commit(next: Omit<SessionListSnapshot, 'revision'>): void {
  snapshot = Object.freeze({
    ...next,
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

function getSnapshot(): SessionListSnapshot {
  return snapshot;
}

function publish(next: Omit<SessionListSnapshot, 'revision'>): void {
  commit(next);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const bridge: SessionListBridge = {
  getSnapshot,
  publish,
  subscribe,
};

export function installSessionListBridge(): SessionListBridge {
  const existing = window.__socratesSessionListBridge;
  if (existing) return existing;
  window.__socratesSessionListBridge = bridge;
  return bridge;
}

export function getSessionListSnapshot(): SessionListSnapshot {
  return installSessionListBridge().getSnapshot();
}

export function subscribeToSessionList(listener: Listener): () => void {
  return installSessionListBridge().subscribe(listener);
}

export function publishSessionList(
  sessions: ReadonlyArray<SessionListSnapshot['sessions'][number]>,
  currentSessionId: string | null,
  searchQuery: string,
  filter: string | null,
  fetchFailed: boolean,
): void {
  commit({ sessions, currentSessionId, searchQuery, filter, fetchFailed });
}
