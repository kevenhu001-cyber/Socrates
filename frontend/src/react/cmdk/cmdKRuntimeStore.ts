import type {
  CmdKBridge,
  CmdKHit,
  CmdKSnapshot,
} from './types';

type Listener = () => void;

const HIDDEN: CmdKSnapshot = Object.freeze({
  isOpen: false,
  query: '',
  results: Object.freeze([] as ReadonlyArray<CmdKHit>),
  selectedIndex: 0,
  recent: Object.freeze([] as ReadonlyArray<string>),
  revision: 0,
});

let snapshot: CmdKSnapshot = HIDDEN;
const listeners = new Set<Listener>();

function commit(next: Omit<CmdKSnapshot, 'revision'>): void {
  snapshot = Object.freeze({
    ...next,
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

function getSnapshot(): CmdKSnapshot {
  return snapshot;
}

function publish(next: Omit<CmdKSnapshot, 'revision'>): void {
  commit(next);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const bridge: CmdKBridge = {
  getSnapshot,
  publish,
  subscribe,
};

/**
 * Idempotent install — mirrors the chatRuntimeStore pattern. Calling this
 * more than once returns the existing bridge so legacy module callbacks
 * that fire before React mounts aren't lost.
 */
export function installCmdKBridge(): CmdKBridge {
  const existing = window.__socratesCmdK;
  if (existing) return existing;
  window.__socratesCmdK = bridge;
  return bridge;
}

export function getCmdKSnapshot(): CmdKSnapshot {
  return installCmdKBridge().getSnapshot();
}

export function subscribeToCmdK(listener: Listener): () => void {
  return installCmdKBridge().subscribe(listener);
}