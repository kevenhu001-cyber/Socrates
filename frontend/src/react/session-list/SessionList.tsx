import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import { Button } from '../ui/shadcn/button';
import { getLegacyActions, i18n } from '../legacy/gateway.ts';
import { ErrorBoundary } from '../ErrorBoundary';
import { setCurrentSessionId, useSessionListSnapshot } from './sessionList.store';
import { useSidebarStore } from '../../sidebar/sidebar.store.ts';
import { closeSidebarOnMobile } from '../../sidebar/sidebar.service.ts';
import { detailCache } from '../../session/detailCache.ts';
import { SessionListEmptyState } from './SessionListEmptyState';
import { SessionTimeline } from './SessionTimeline';
import { loadMoreServerSessions } from '../../session/recents.ts';
import {
  getSessionListPagingSnapshot,
  subscribeSessionListPaging,
} from '../../session/sessionListPagingState.ts';

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

/** The sentinel stays outside the virtual window so it observes the real
 * end of the transcript-like list without mounting off-screen rows. */
function SessionListMore({ enabled }: { enabled: boolean }) {
  const paging = useSyncExternalStore(
    subscribeSessionListPaging,
    getSessionListPagingSnapshot,
    getSessionListPagingSnapshot,
  );
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !paging.initialized || !paging.nextCursor || paging.failed || paging.loading)
      return;
    const node = target.current;
    const root = node?.closest<HTMLElement>('#recentsPanel');
    if (!node || !root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMoreServerSessions();
      },
      { root, rootMargin: '0px 0px 240px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, paging.initialized, paging.nextCursor, paging.failed, paging.loading]);

  if (!paging.initialized || !paging.nextCursor) return null;
  return (
    <div ref={target} className="recents-page-status" role="status" aria-live="polite">
      {paging.failed ? (
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => void loadMoreServerSessions()}
        >
          {i18n('session.retry', 'Retry loading older chats')}
        </Button>
      ) : paging.loading ? (
        <span>{i18n('chat.history.loadingEarlier', 'Loading older chats…')}</span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => void loadMoreServerSessions()}
        >
          {i18n('sidebar.loadOlder', 'Load older chats')}
        </Button>
      )}
    </div>
  );
}

export function SessionList() {
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

  return (
    <>
      {sessions.length ? (
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
      ) : (
        <SessionListEmptyState
          searchQuery={searchQuery}
          filter={filter}
          fetchFailed={fetchFailed}
        />
      )}
      {/* Sidebar text filtering only affects loaded rows. Avoid paging through
          the entire account in an attempt to satisfy a local search. */}
      <SessionListMore enabled={sidebarOpen && !searchQuery} />
      <Button
        variant="ghost"
        size="touch"
        className="recents-search-all"
        onClick={() => {
          closeSidebarOnMobile();
          getLegacyActions().cmdK.openCmdK();
        }}
      >
        <span data-i18n-key="sidebar.searchAllChats">
          {i18n('sidebar.searchAllChats', 'Search all chats')}
        </span>
        <ChevronRightIcon aria-hidden />
      </Button>
    </>
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
      <SessionList />
    </ErrorBoundary>,
  );
}
