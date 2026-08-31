/**
 * Session list bridge — M2 single-bridge migration.
 *
 * The legacy `main.js` session list publisher calls
 * `window.__socratesSessionListBridge.publish(...)`. The M2 bridge also
 * exposes the two convenience publishers `publishSessionList` and
 * `setCurrentSessionId` that the legacy store grew organically — both
 * route through the factory's `dispatch` reducer.
 *
 * M2 conventions
 *  - `getSnapshot` / `subscribe` / `dispatch` come from the factory.
 *  - `publish` is a thin alias on the window-published bridge for
 *    legacy callers.
 *  - React subscribers use `useBridge(bridge)` directly.
 */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import type { SessionItem, SessionListBridge, SessionListSnapshot } from './types';

declare global {
  interface Window {
    __socratesSessionListBridge?: SessionListBridge;
  }
}

const INITIAL: SessionListSnapshot = {
  sessions: [],
  currentSessionId: null,
  searchQuery: '',
  filter: null,
  fetchFailed: false,
  revision: 0,
};

type Action = Omit<SessionListSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<SessionListSnapshot, Action>({
  initial: INITIAL,
  reducer: (state, action) => ({ ...action, revision: state.revision + 1 }),
});

const bridge: SessionListBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as SessionListBridge;

export function installSessionListBridge(): SessionListBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesSessionListBridge) {
      window.__socratesSessionListBridge = bridge;
    }
    return window.__socratesSessionListBridge;
  }
  return bridge;
}

export function getSessionListSnapshot(): SessionListSnapshot {
  return installSessionListBridge().getSnapshot();
}

export function subscribeToSessionList(listener: () => void): () => void {
  return installSessionListBridge().subscribe(listener);
}

export function publishSessionList(
  sessions: ReadonlyArray<SessionItem>,
  currentSessionId: string | null,
  searchQuery: string,
  filter: string | null,
  fetchFailed: boolean,
): void {
  factoryBridge.dispatch({
    sessions,
    currentSessionId,
    searchQuery,
    filter,
    fetchFailed,
  });
}

/**
 * Optimistically update only the active session id without rebuilding the
 * rest of the snapshot. Called from the row's click handler so the
 * `.active` highlight appears immediately — without it, the highlight only
 * changes after `loadSession()` finishes its async fetch and the next
 * `renderRecents()` re-publishes the snapshot (visible lag).
 * The next regular publish will reconcile any drift, so this is safe to
 * fire before the legacy loadSession pipeline completes.
 */
export function setCurrentSessionId(id: string | null): void {
  const current = factoryBridge.getSnapshot();
  if (current.currentSessionId === id) return;
  factoryBridge.dispatch({
    sessions: current.sessions,
    currentSessionId: id,
    searchQuery: current.searchQuery,
    filter: current.filter,
    fetchFailed: current.fetchFailed,
  });
}

export function useSessionListSnapshot(): SessionListSnapshot {
  return useBridge(factoryBridge);
}

export function useSessions(): ReadonlyArray<SessionItem> {
  return useBridge(factoryBridge).sessions;
}

export function useCurrentSessionId(): string | null {
  return useBridge(factoryBridge).currentSessionId;
}

export function formatRelativeTime(value: string | number | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  return `${months}mo ago`;
}
