/** Settings-only presentation state. Provider configuration has its own domain store. */

import { createStore, useStore } from 'zustand';
import type { SettingsBridge, SettingsSnapshot } from './types';

type Action = Partial<Omit<SettingsSnapshot, 'revision'>>;

const initial: SettingsSnapshot = Object.freeze({
  section: 'general',
  query: '',
  mobileDetail: false,
  externalApiOn: true,
  revision: 0,
});
const store = createStore(() => initial);

const bridge = {
  getSnapshot: store.getState,
  subscribe: store.subscribe,
  publish(patch: Action): void {
    // Controlled search input needs the new value within the input event.
    store.setState(
      (state) => Object.freeze({ ...state, ...patch, revision: state.revision + 1 }),
      true,
    );
  },
  __resetForTests(): void {
    store.setState(initial, true);
  },
};

export function installSettingsBridge(): SettingsBridge {
  return bridge;
}

export function getSettingsSnapshot(): SettingsSnapshot {
  return installSettingsBridge().getSnapshot();
}

export function subscribeToSettings(listener: () => void): () => void {
  return installSettingsBridge().subscribe(listener);
}

export function useSettingsSnapshot(): SettingsSnapshot {
  return useStore(store);
}
