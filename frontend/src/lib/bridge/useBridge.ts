/**
 * useBridge — React hooks for the `createImmutableBridge` factory.
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

import type { ImmutableBridge } from './createImmutableBridge';

export function useBridge<Snapshot>(bridge: ImmutableBridge<Snapshot, unknown>): Snapshot {
  const subscribe = useCallback(
    (listener: () => void) => bridge.subscribe(listener),
    [bridge],
  );
  const getSnapshot = useCallback(() => bridge.getSnapshot(), [bridge]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useBridgeSelector<Snapshot, Slice>(
  bridge: ImmutableBridge<Snapshot, unknown>,
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