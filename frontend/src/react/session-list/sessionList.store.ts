import { useBridge, useBridgeSelector } from '../../lib/bridge';
import { sessionListState, setCurrentSessionId } from '../../ui/sessionListState.ts';
import type { SessionItem, SessionListSnapshot } from '../../ui/sessionListState.ts';

export { setCurrentSessionId };

export function getSessionListSnapshot(): SessionListSnapshot {
  return sessionListState.getSnapshot();
}

export function subscribeToSessionList(listener: () => void): () => void {
  return sessionListState.subscribe(listener);
}

export function useSessionListSnapshot(): SessionListSnapshot {
  return useBridge(sessionListState);
}

export function useSessions(): ReadonlyArray<SessionItem> {
  return useBridgeSelector(sessionListState, (snapshot) => snapshot.sessions);
}

export function useCurrentSessionId(): string | null {
  return useBridgeSelector(sessionListState, (snapshot) => snapshot.currentSessionId);
}

/* Canonical relative-time formatter lives in ui/recentsHelpers.ts so the
   sidebar list and the mistake book share one output contract. */
export { formatRelativeTime } from '../../ui/recentsHelpers.ts';

export function useSessionListSearchQuery(): string {
  return useBridgeSelector(sessionListState, (snapshot) => snapshot.searchQuery);
}
