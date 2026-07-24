import type { SettingsBridge, SettingsSnapshot } from './types';

type Listener = () => void;

const INITIAL_SNAPSHOT: SettingsSnapshot = Object.freeze({
  open: false,
  bodyHTML: '',
  revision: 0,
});

let snapshot: SettingsSnapshot = INITIAL_SNAPSHOT;
const listeners = new Set<Listener>();

function commit(next: Omit<SettingsSnapshot, 'revision'>): void {
  snapshot = Object.freeze({
    ...next,
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

function getSnapshot(): SettingsSnapshot {
  return snapshot;
}

function publish(next: Omit<SettingsSnapshot, 'revision'>): void {
  commit(next);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const bridge: SettingsBridge = { getSnapshot, publish, subscribe };

export function installSettingsBridge(): SettingsBridge {
  const existing = window.__socratesSettingsBridge;
  if (existing) return existing;
  window.__socratesSettingsBridge = bridge;
  return bridge;
}

export function getSettingsSnapshot(): SettingsSnapshot {
  return installSettingsBridge().getSnapshot();
}

export function subscribeToSettings(listener: Listener): () => void {
  return installSettingsBridge().subscribe(listener);
}
