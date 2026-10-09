import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { getLegacyActions } from '../legacy/gateway.ts';
import { ErrorBoundary } from '../ErrorBoundary';
import { installSessionListBridge, setCurrentSessionId, useSessionListSnapshot } from './sessionList.bridge';
import { detailCache } from '../../session/detailCache.js';
import { SessionListEmptyState } from './SessionListEmptyState';
import { SessionTimeline } from './SessionTimeline';

function useMinuteTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 60000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

function SessionListInner() {
  const { sessions, currentSessionId, searchQuery, filter, fetchFailed } = useSessionListSnapshot();
  const nowTick = useMinuteTick();

  useEffect(() => {
    if (sessions.length > 0) {
      detailCache.idleWarmup(sessions.map((session) => session.id).filter(Boolean));
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

  const handleDragStart = useCallback((event: React.DragEvent, id: string) => {
    getLegacyActions().sessions.onSessionDragStart(event.nativeEvent, id);
  }, []);

  const handleDragEnd = useCallback((event: React.DragEvent) => {
    getLegacyActions().sessions.onSessionDragEnd(event.nativeEvent);
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
  if (!container || hostIsMountedBy(container, 'session-list')) return;
  installSessionListBridge();
  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <SessionListInner />
    </ErrorBoundary>,
  );
  markHostMountedBy(container, 'session-list');
}
