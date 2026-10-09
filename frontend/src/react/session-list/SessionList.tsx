import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { getLegacyActions, t } from '../legacy/gateway.ts';
import { ErrorBoundary } from '../ErrorBoundary';
import { installSessionListBridge, setCurrentSessionId, useSessionListSnapshot } from './sessionList.bridge';
import { detailCache } from '../../session/detailCache.js';
import { clearRecentsFilter } from '../../sidebar/sidebar.service';
import { SessionRow } from './SessionRow';
import { timeGroupLabel } from './sessionListModel';

function useMinuteTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 60000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="recents-empty">
      <div className="recents-empty-text">{children}</div>
    </div>
  );
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
    return <EmptySessionList searchQuery={searchQuery} filter={filter} fetchFailed={fetchFailed} />;
  }

  const now = new Date();
  let previousGroup: string | null = null;
  return (
    <div className="recents-list-content">
      {sessions.map((session) => {
        const group = timeGroupLabel(session, now);
        const header = group !== previousGroup
          ? <div className="recents-time-label" key={'g-' + group + '-' + session.id}>{group}</div>
          : null;
        previousGroup = group;
        return (
          <React.Fragment key={session.id}>
            {header}
            <SessionRow
              session={session}
              isActive={session.id === currentSessionId}
              nowTick={nowTick}
              onPick={handlePick}
              onTag={handleTag}
              onArchive={handleArchive}
              onDelete={handleDelete}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

function EmptySessionList({
  searchQuery,
  filter,
  fetchFailed,
}: {
  searchQuery: string;
  filter: string | null;
  fetchFailed: boolean;
}) {
  const sessionActions = getLegacyActions().sessions;
  let content: React.ReactNode;

  if (searchQuery) {
    const [before, after] = t('session.noSearchMatch').split('{query}');
    content = (
      <>
        {before}<strong>&ldquo;{searchQuery}&rdquo;</strong>{after}<br />
        <a href="#" onClick={(event) => {
          event.preventDefault();
          sessionActions.setRecentsSearch('');
        }}>{t('session.clearSearch')}</a> {t('session.showAllHint')}
      </>
    );
  } else if (fetchFailed && !filter) {
    content = (
      <>
        {t('session.loadListFailed')}<br />
        <a href="#" onClick={(event) => {
          event.preventDefault();
          sessionActions.retryRecentsFetch();
        }}>{t('session.retry')}</a>
      </>
    );
  } else if (filter) {
    const filterLabel = filter.indexOf('project:') === 0 ? 'Project' : '#' + filter;
    const [before, after] = t('session.noFilterMatch').split('{filter}');
    content = (
      <>
        {before}<strong>{filterLabel}</strong>{after}<br />
        <a href="#" onClick={(event) => {
          event.preventDefault();
          clearRecentsFilter();
        }}>{t('session.clearFilter')}</a> {t('session.showAllHint')}
      </>
    );
  } else {
    content = <>{t('session.empty')}<br />{t('session.emptyHint')}</>;
  }

  return <div className="recents-list-content"><EmptyState>{content}</EmptyState></div>;
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
