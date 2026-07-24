import { useSyncExternalStore } from 'react';
import { getCheatsheetSnapshot, subscribeToCheatsheet } from './cheatsheetStore';
import type { CheatsheetSnapshot } from './types';

export function useCheatsheetSnapshot(): CheatsheetSnapshot {
  return useSyncExternalStore(subscribeToCheatsheet, getCheatsheetSnapshot, getCheatsheetSnapshot);
}

export function useCheatsheetDispatch() {
  return {
    close: () => { if (typeof window.closeCheatsheet === 'function') window.closeCheatsheet(); },
  };
}
