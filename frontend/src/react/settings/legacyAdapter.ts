import { useSyncExternalStore } from 'react';

import {
  getSettingsSnapshot,
  subscribeToSettings,
} from './settingsStore';
import type { SettingsSnapshot } from './types';

export function useSettingsSnapshot(): SettingsSnapshot {
  return useSyncExternalStore(
    subscribeToSettings,
    getSettingsSnapshot,
    getSettingsSnapshot,
  );
}
