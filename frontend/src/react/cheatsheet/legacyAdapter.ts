import { useSyncExternalStore } from 'react';
import { getCheatsheetSnapshot, subscribeToCheatsheet } from './cheatsheetStore';
import type { CheatsheetSnapshot } from './types';
import { getLegacyActions } from '../legacy/gateway';

export function useCheatsheetSnapshot(): CheatsheetSnapshot {
  return useSyncExternalStore(subscribeToCheatsheet, getCheatsheetSnapshot, getCheatsheetSnapshot);
}

export function useCheatsheetDispatch() {
  return {
    close: () => getLegacyActions().navigation.closeCheatsheet(),
  };
}
