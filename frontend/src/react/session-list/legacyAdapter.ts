import { useSyncExternalStore } from 'react';

import {
  getSessionListSnapshot,
  subscribeToSessionList,
} from './sessionListStore';
import type { SessionListSnapshot, SessionItem } from './types';

export function useSessionListSnapshot(): SessionListSnapshot {
  return useSyncExternalStore(
    subscribeToSessionList,
    getSessionListSnapshot,
    getSessionListSnapshot,
  );
}

export function useSessions(): ReadonlyArray<SessionItem> {
  return useSyncExternalStore(
    subscribeToSessionList,
    () => getSessionListSnapshot().sessions,
    () => getSessionListSnapshot().sessions,
  );
}

export function useCurrentSessionId(): string | null {
  return useSyncExternalStore(
    subscribeToSessionList,
    () => getSessionListSnapshot().currentSessionId,
    () => getSessionListSnapshot().currentSessionId,
  );
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
