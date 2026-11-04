import React, { useCallback, useEffect, useState } from 'react';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import { getLegacyActions } from '../legacy/gateway.ts';
import { ErrorBoundary } from '../ErrorBoundary';
import { setCurrentSessionId, useSessionListSnapshot } from './sessionList.store';
import { useSidebarStore } from '../../sidebar/sidebar.store.ts';
import { detailCache } from '../../session/detailCache.ts';
import { SessionListEmptyState } from './SessionListEmptyState';
import { SessionTimeline } from './SessionTimeline';

/**
 * Minute heartbeat that keeps the relative time labels ("5m ago") current.
 * Gated by `enabled` (the sidebar is visible) and skips fires while the tab
 * is hidden: the list re-rendered every 60s even with the rail collapsed or
 * the tab in the background. Re-enabling refreshes once so labels are never
 * stale right after reopening the sidebar.
 */
function useMinuteTick(enabled: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    setTick((value) => value + 1);
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setTick((value) => value + 1);
    }, 60000);
    return () => clearInterval(id);
  }, [enabled]);
  return tick;
}

function SessionListInner() {
  const { sessions, currentSessionId, searchQuery, filter, fetchFailed } = useSessionListSnapshot();
  const sidebarOpen = useSidebarStore((snapshot) => snapshot.isOpen);
  const nowTick = useMinuteTick(sidebarOpen);

  useEffect(() => {
    if (sessions.length > 0) {
      detailCache.idleWarmup(sessions.slice(0, 3).map((session) => session.id));
    }
  }, [sessions]);

  const handlePick = useCallback((id: string) => {
    /* Update the highlight on the click frame instead of waiting for fetch. */
    setCurrentSessionId(id);
    getLegacyActions().sessions.loadSession(id);
  }, []);

  const handleTag = useCallback((id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    getLegacyActions().sessions.openTagEditor(id, event.nativeEvent);
  }, []);

  const handleArchive = useCallback((id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    getLegacyActions().sessions.archiveSession(id, event.nativeEvent);
  }, []);

  const handleDelete = useCallback((id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    getLegacyActions().sessions.deleteSession(id, event.nativeEvent);
  }, []);

  /* Native drag events: the row is a react-native-web view (see SessionRow). */
  const handleDragStart = useCallback((event: DragEvent, id: string) => {
    getLegacyActions().sessions.onSessionDragStart(event, id);
  }, []);

  const handleDragEnd = useCallback((event: DragEvent) => {
    getLegacyActions().sessions.onSessionDragEnd(event);
  }, []);

  if (!sessions.length) {
    return <SessionListEmptyState searchQuery={searchQuery} filter={filter} fetchFailed={fetchFailed} />;
  }

  return (
    <SessionTimeline
      sessions={sessions}
      currentSessionId={currentSessionId}
      nowTick={nowTick}
      onPick={handlePick}
      onTag={handleTag}
      onArchive={handleArchive}
      onDelete={handleDelete}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    />
  );
}

const LIST_ID = 'recentsList';

/** Mount React into the empty legacy-owned session-list host. Idempotent. */
export function mountSessionList(): void {
  const container = document.getElementById(LIST_ID);
  if (!container) return;
  mountOwnedRoot(
    container,
    'session-list',
    <ErrorBoundary>
      <SessionListInner />
    </ErrorBoundary>,
  );
}
