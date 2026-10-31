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

export function useSessionListSearchQuery(): string {
  return useBridgeSelector(sessionListState, (snapshot) => snapshot.searchQuery);
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
