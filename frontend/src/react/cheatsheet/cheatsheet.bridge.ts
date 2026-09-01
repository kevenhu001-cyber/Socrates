/**
 * Cheatsheet bridge — M2 single-bridge migration.
 *
 * The cheatsheet modal opens/closes via the legacy `ui/cheatsheet.js`
 * publisher, which calls `window.__socratesCheatsheetBridge.publish(...)`.
 * The bridge contract stays identical to the pre-M2 triple
 * (`cheatsheetStore.ts` + `legacyAdapter.ts`); the implementation now
 * routes through `createImmutableBridge` from `src/lib/bridge`.
 *
 * M2 conventions
 *  - `getSnapshot` / `subscribe` / `dispatch` come from the factory.
 *  - `publish` is added as a thin alias on the window-published bridge so
 *    `ui/cheatsheet.js` and any other legacy caller keep working.
 *  - React subscribers use `useBridge(bridge)` directly; the legacy
 *    `useSyncExternalStore` wrapper is gone.
 *  - `useCheatsheetDispatch()` returns `{ close }` because the only
 *    action lives in the legacy navigation module; the bridge state
 *    itself never receives the close call (the legacy `ui/cheatsheet.js`
 *    publishes the resulting `open: false` itself).
 */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import { getLegacyActions } from '../legacy/gateway';
import type { CheatsheetBridge, CheatsheetSnapshot } from './types';

declare global {
  interface Window {
    __socratesCheatsheetBridge?: CheatsheetBridge;
  }
}

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
  if (typeof window !== 'undefined') {
    if (!window.__socratesCheatsheetBridge) {
      window.__socratesCheatsheetBridge = bridge;
    }
    return window.__socratesCheatsheetBridge;
  }
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
