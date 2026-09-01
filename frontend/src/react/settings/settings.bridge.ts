/**
 * Settings bridge — M2 single-bridge migration.
 *
 * The legacy `ui/settings.js` publisher calls
 * `window.__socratesSettingsBridge.publish(...)`. The M1 factory owns
 * the snapshot/reducer/listener loop; this module wraps it with the
 * legacy `publish` alias and exposes a React hook built on `useBridge`.
 *
 * M4 step 4.5b: the snapshot carries `{ open, externalApiOn }` only.
 * React owns the overlay skeleton; legacy publishes visibility + toggle
 * state (no more bodyHTML round-trip — React renders the static parts).
 */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import type { SettingsBridge, SettingsSnapshot } from './types';

declare global {
  interface Window {
    __socratesSettingsBridge?: SettingsBridge;
  }
}

type Action = Omit<SettingsSnapshot, 'revision'>;

/* Seed `externalApiOn` from the same localStorage key legacy settings.js
   reads, so the toggle track renders correctly before the first publish. */
function initialExternalApiOn(): boolean {
  try {
    const saved = localStorage.getItem('socrates-external-api');
    if (saved !== null) return saved === 'true';
  } catch (_) { /* ignore */ }
  return true;
}

const factoryBridge = createImmutableBridge<SettingsSnapshot, Action>({
  initial: { open: false, externalApiOn: initialExternalApiOn(), revision: 0 },
  reducer: (_state, action) => action,
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
