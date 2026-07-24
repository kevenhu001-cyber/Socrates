import type {
  ScheduledBridge,
  ScheduledSnapshot,
  ScheduledTask,
} from './types';

type Listener = () => void;

const INITIAL: ScheduledSnapshot = Object.freeze({
  tasks: Object.freeze([] as ReadonlyArray<ScheduledTask>),
  loading: false,
  error: null,
  revision: 0,
});

let snapshot: ScheduledSnapshot = INITIAL;
const listeners = new Set<Listener>();

function commit(next: Omit<ScheduledSnapshot, 'revision'>): void {
  snapshot = Object.freeze({
    ...next,
    tasks: Object.freeze([...next.tasks]),
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

function getSnapshot(): ScheduledSnapshot {
  return snapshot;
}

function publish(next: Omit<ScheduledSnapshot, 'revision'>): void {
  commit(next);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const bridge: ScheduledBridge = {
  getSnapshot,
  publish,
  subscribe,
};

export function installScheduledBridge(): ScheduledBridge {
  const existing = window.__socratesScheduledBridge;
  if (existing) return existing;
  window.__socratesScheduledBridge = bridge;
  return bridge;
}

export function getScheduledSnapshot(): ScheduledSnapshot {
  return installScheduledBridge().getSnapshot();
}

export function subscribeToScheduled(listener: Listener): () => void {
  return installScheduledBridge().subscribe(listener);
}
