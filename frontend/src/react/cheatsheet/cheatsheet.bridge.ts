/** Module-owned cheatsheet state shared with the UI facade and React. */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import { getLegacyActions } from '../legacy/gateway.ts';
import type { CheatsheetBridge, CheatsheetSnapshot } from './types';

type Action = Omit<CheatsheetSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<CheatsheetSnapshot, Action>({
  initial: { open: false, revision: 0 },
  reducer: (_state, action) => action,
});

/* Augment the factory bridge with a `publish` alias so legacy code
   calling `bridge.publish(...)` keeps working. The factory's contract
   uses `dispatch`; the alias bridges the two naming conventions. */
const bridge: CheatsheetBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as CheatsheetBridge;

export function installCheatsheetBridge(): CheatsheetBridge {
  return bridge;
}

export function getCheatsheetSnapshot(): CheatsheetSnapshot {
  return installCheatsheetBridge().getSnapshot();
}

export function subscribeToCheatsheet(listener: () => void): () => void {
  return installCheatsheetBridge().subscribe(listener);
}

export function useCheatsheetSnapshot(): CheatsheetSnapshot {
  return useBridge(factoryBridge);
}

export function useCheatsheetDispatch(): { close: () => void } {
  return {
    close: () => getLegacyActions().navigation.closeCheatsheet(),
  };
}
