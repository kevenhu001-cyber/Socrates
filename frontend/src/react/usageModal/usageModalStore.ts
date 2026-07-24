import type {
  UsageBridge,
  UsageSnapshot,
} from './types';

type Listener = () => void;

const HIDDEN: UsageSnapshot = Object.freeze({
  isOpen: false,
  bodyHtml: '',
  revision: 0,
});

let snapshot: UsageSnapshot = HIDDEN;
const listeners = new Set<Listener>();

function commit(next: Omit<UsageSnapshot, 'revision'>): void {
  snapshot = Object.freeze({
    ...next,
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

function getSnapshot(): UsageSnapshot {
  return snapshot;
}

function publish(next: Omit<UsageSnapshot, 'revision'>): void {
  commit(next);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const bridge: UsageBridge = {
  getSnapshot,
  publish,
  subscribe,
};

export function installUsageBridge(): UsageBridge {
  const existing = window.__socratesUsageBridge;
  if (existing) return existing;
  window.__socratesUsageBridge = bridge;
  return bridge;
}

export function getUsageSnapshot(): UsageSnapshot {
  return installUsageBridge().getSnapshot();
}

export function subscribeToUsage(listener: Listener): () => void {
  return installUsageBridge().subscribe(listener);
}
