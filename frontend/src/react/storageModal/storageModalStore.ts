import type { StorageBridge, StorageSnapshot } from './types';

type Listener = () => void;

const INITIAL: StorageSnapshot = { archived: [], open: false, revision: 0 };

let snapshot: StorageSnapshot = INITIAL;
const listeners = new Set<Listener>();

function commit(next: Omit<StorageSnapshot, 'revision'>): void {
  snapshot = { ...next, archived: Object.freeze([...next.archived]), revision: snapshot.revision + 1 };
  listeners.forEach((l) => l());
}

function getSnapshot(): StorageSnapshot { return snapshot; }
function publish(next: Omit<StorageSnapshot, 'revision'>): void { commit(next); }
function subscribe(listener: Listener): () => void { listeners.add(listener); return () => listeners.delete(listener); }

const bridge: StorageBridge = { getSnapshot, publish, subscribe };

export function installStorageBridge(): StorageBridge {
  const existing = window.__socratesStorageBridge;
  if (existing) return existing;
  window.__socratesStorageBridge = bridge;
  return bridge;
}

export function getStorageSnapshot(): StorageSnapshot { return installStorageBridge().getSnapshot(); }
export function subscribeToStorage(listener: Listener): () => void { return installStorageBridge().subscribe(listener); }
