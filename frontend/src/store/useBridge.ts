/**
 * React hooks for the state bridges.
 *
 * `useBridge(bridge)` returns the entire snapshot via React's
 * `useSyncExternalStore`. The subscription contract matches React's
 * external-store model, so concurrent rendering (Strict Mode,
 * Suspense, transitions) sees consistent snapshots.
 *
 * `useBridgeSelector(bridge, selector)` returns a derived slice via
 * `useSyncExternalStoreWithSelector`. The selector is invoked with
 * the current snapshot and the previous slice; returning a stable
 * reference for unchanged input skips the re-render. Equality is
 * `Object.is`.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector.js';

import type { Bridge } from './bridge.ts';

export function useBridge<Snapshot>(bridge: Bridge<Snapshot, unknown>): Snapshot {
  const subscribe = useCallback(
    (listener: () => void) => bridge.subscribe(listener),
    [bridge],
  );
  const getSnapshot = useCallback(() => bridge.getSnapshot(), [bridge]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useBridgeSelector<Snapshot, Slice>(
  bridge: Bridge<Snapshot, unknown>,
  selector: (snapshot: Snapshot) => Slice,
  isEqual?: (a: Slice, b: Slice) => boolean,
): Slice {
  const subscribe = useCallback(
    (listener: () => void) => bridge.subscribe(listener),
    [bridge],
  );
  const getSnapshot = useCallback(() => bridge.getSnapshot(), [bridge]);
  return useSyncExternalStoreWithSelector(
    subscribe,
    getSnapshot,
    getSnapshot,
    selector,
    isEqual,
  );
}
