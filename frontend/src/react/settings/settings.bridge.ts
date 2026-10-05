/** Settings-only presentation state. Provider configuration has its own domain store. */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import type { SettingsBridge, SettingsSnapshot } from './types';

declare global {
  interface Window {
    __socratesSettingsBridge?: SettingsBridge;
  }
}

type Action = Partial<Omit<SettingsSnapshot, 'revision'>>;

const factoryBridge = createImmutableBridge<SettingsSnapshot, Action>({
  initial: {
    open: false,
    externalApiOn: true,
    revision: 0,
  },
  reducer: (state, action) => ({ ...state, ...action }),
});

const bridge: SettingsBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as SettingsBridge;

export function installSettingsBridge(): SettingsBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesSettingsBridge) {
      window.__socratesSettingsBridge = bridge;
    }
    return window.__socratesSettingsBridge;
  }
  return bridge;
}

export function getSettingsSnapshot(): SettingsSnapshot {
  return installSettingsBridge().getSnapshot();
}

export function subscribeToSettings(listener: () => void): () => void {
  return installSettingsBridge().subscribe(listener);
}

export function useSettingsSnapshot(): SettingsSnapshot {
  return useBridge(factoryBridge);
}
