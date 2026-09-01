/**
 * Find-in-session bridge — M2 single-bridge migration.
 *
 * The find bar is opened by `ui/findInSession.js` and by the React
 * component itself, both calling
 * `window.__socratesFindInSession.publish(...)`. The factory owns the
 * snapshot/reducer/listener loop; this module adds the legacy alias
 * and the React-friendly helpers.
 *
 * Note: `FindInSessionSnapshot` did not track a `revision` field before
 * M2 — the legacy store relied on identity changes alone to wake
 * subscribers. With M2 we add an internal `revision` counter so the
 * factory's `useSyncExternalStore` integration sees a stable snapshot
 * between publishes; the field is internal and not part of the public
 * snapshot shape.
 */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import type {
  FindInSessionBridge,
  FindInSessionSnapshot,
} from './types';

declare global {
  interface Window {
    __socratesFindInSession?: FindInSessionBridge;
  }
}

const CLOSED: FindInSessionSnapshot = {
  isOpen: false,
  query: '',
  matchCount: 0,
  activeIndex: -1,
};

type Action = FindInSessionSnapshot;

const factoryBridge = createImmutableBridge<FindInSessionSnapshot & { revision: number }, Action>({
  initial: { ...CLOSED, revision: 0 },
  reducer: (_state, action) => action,
});

const bridge: FindInSessionBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as FindInSessionBridge;

export function installFindInSessionBridge(): FindInSessionBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesFindInSession) {
      window.__socratesFindInSession = bridge;
    }
    return window.__socratesFindInSession;
  }
  return bridge;
}

export function getFindInSessionSnapshot(): FindInSessionSnapshot {
  const { revision: _ignored, ...rest } = factoryBridge.getSnapshot();
  return rest;
}

export function subscribeToFindInSession(listener: () => void): () => void {
  return installFindInSessionBridge().subscribe(listener);
}

export function useFindInSessionSnapshot(): FindInSessionSnapshot {
  const full = useBridge(factoryBridge);
  const { revision: _ignored, ...rest } = full;
  return rest;
}
