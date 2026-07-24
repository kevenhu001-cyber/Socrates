import type {
  MorePopoverBridge,
  MorePopoverSnapshot,
} from './types';

type Listener = () => void;

const HIDDEN: MorePopoverSnapshot = Object.freeze({
  isOpen: false,
  revision: 0,
});

let snapshot: MorePopoverSnapshot = HIDDEN;
const listeners = new Set<Listener>();

function commit(next: Omit<MorePopoverSnapshot, 'revision'>): void {
  snapshot = Object.freeze({
    ...next,
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

function getSnapshot(): MorePopoverSnapshot {
  return snapshot;
}

function publish(next: Omit<MorePopoverSnapshot, 'revision'>): void {
  commit(next);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const bridge: MorePopoverBridge = {
  getSnapshot,
  publish,
  subscribe,
};

export function installMorePopoverBridge(): MorePopoverBridge {
  const existing = window.__socratesMorePopoverBridge;
  if (existing) return existing;
  window.__socratesMorePopoverBridge = bridge;
  return bridge;
}

export function getMorePopoverSnapshot(): MorePopoverSnapshot {
  return installMorePopoverBridge().getSnapshot();
}

export function subscribeToMorePopover(listener: Listener): () => void {
  return installMorePopoverBridge().subscribe(listener);
}
