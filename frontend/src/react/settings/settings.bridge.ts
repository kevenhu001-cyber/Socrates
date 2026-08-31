/**
 * Settings bridge — M2 single-bridge migration.
 *
 * The legacy `ui/settings.js` publisher calls
 * `window.__socratesSettingsBridge.publish(...)`. The M1 factory owns
 * the snapshot/reducer/listener loop; this module wraps it with the
 * legacy `publish` alias and exposes a React hook built on `useBridge`.
 */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import type { SettingsBridge, SettingsSnapshot } from './types';

declare global {
  interface Window {
    __socratesSettingsBridge?: SettingsBridge;
  }
}

type Action = Omit<SettingsSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<SettingsSnapshot, Action>({
  initial: { open: false, bodyHTML: '', revision: 0 },
  reducer: (state, action) => ({ ...action, revision: state.revision + 1 }),
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
