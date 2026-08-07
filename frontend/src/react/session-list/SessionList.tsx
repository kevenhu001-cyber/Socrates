import React, { useCallback, useEffect, useState, memo } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { getLegacyActions, t } from '../legacy/gateway';
import { ErrorBoundary } from '../ErrorBoundary';
import { installSessionListBridge, publishSessionList, setCurrentSessionId } from './sessionListStore';
import { useSessionListSnapshot, formatRelativeTime } from './legacyAdapter';
import type { SessionItem } from './types';

const TAG_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';

const DELETE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

const PIN_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><path d="M12 2v10l4 4v2H8v-2l4-4V2"/></svg>';

function esc(s: string | undefined | null): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c,
  );
}

function safeId(sessionId: string): string {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
  }
  return 'r-' + Math.abs(hash);
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/* UI-align: open-webui-style time buckets for the session list.
   Pinned rows get their own group at the top; the rest fall into
   Today / Yesterday / Previous 7 days / Previous 30 days / month / year. */
function timeGroupLabel(session: SessionItem, now: Date): string {
  if (session.pinned) return 'Pinned';
  const raw = session.updatedAt || session.createdAt || Date.now();
  const d = new Date(raw);
  const ts = d.getTime();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startOfDay) return 'Today';
  if (ts >= startOfDay - 86400000) return 'Yesterday';
  if (ts >= startOfDay - 7 * 86400000) return 'Previous 7 days';
  if (ts >= startOfDay - 30 * 86400000) return 'Previous 30 days';
  if (d.getFullYear() === now.getFullYear()) return MONTH_NAMES[d.getMonth()];
  return String(d.getFullYear());
}

function modeLabel(session: SessionItem): { key: string; cls: string } {
  if (session.kind === 'exam') return { key: 'session.badgeExam', cls: 'mode-exam' };
  const mode = session.mode;
  if (mode === 'chat') return { key: 'tutor.modeChat', cls: 'mode-chat' };
  if (mode === 'tutor') return { key: 'tutor.modeTutor', cls: 'mode-tutor' };
  if (session.phase === 'chat') return { key: 'tutor.modeChat', cls: 'mode-chat' };
  return { key: 'tutor.modeTutor', cls: 'mode-tutor' };
}

function buildMeta(session: SessionItem): string[] {
  const meta: string[] = [];
  meta.push(formatRelativeTime(session.updatedAt || session.createdAt || Date.now()));
  const qCount = session.totalQ;
  if (qCount) meta.push(String(qCount) + ' Qs');
  if (session.branchedFrom) {
    meta.push(session.branchedFrom.reExplain ? 'Re-explained' : 'Branched');
  }
  return meta;
}

interface SessionRowProps {
  session: SessionItem;
  isActive: boolean;
  /* Bumped once a minute so memoised rows still refresh their
     "5m ago" label. Without it a row whose data never changes would
     freeze its relative timestamp for the life of the tab. */
  nowTick: number;
  onPick: (id: string) => void;
  onTag: (id: string, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

function SessionRowBase({ session, isActive, onPick, onTag, onDelete, onDragStart, onDragEnd }: SessionRowProps) {
  const ml = modeLabel(session);
  const meta = buildMeta(session);
  const sid = safeId(session.id);
  const label = session.label || '';

  return (
    <div
      className={`recent-item${isActive ? ' active' : ''}${session.pinned ? ' pinned' : ''}`}
      data-recent-id={sid}
      data-recent-actual={session.id}
      draggable
      onDragStart={(e) => onDragStart(e, session.id)}
      onDragEnd={onDragEnd}
      onClick={() => onPick(session.id)}
    >
      <span
        className={`recent-mode-badge ${ml.cls}`}
        title={t(ml.key)}
        data-i18n-key={ml.key}
        data-i18n-title={ml.key}
      >{t(ml.key)}</span>
      <div className="recent-item-main">
        <div className="recent-item-title-row">
          {session.pinned && (
            <span
              className="recent-item-pin-icon"
              title={t('session.pinned')}
              data-i18n-title="session.pinned"
              dangerouslySetInnerHTML={{ __html: PIN_ICON }}
            />
          )}
          <div className="recent-item-text">{session.title || session.topic || '(untitled)'}</div>
          {label && <span className="recent-item-label">{label}</span>}
        </div>
        <div className="recent-item-meta">
          {meta.map((m, i) => (
            <span key={i}>
              {i > 0 && <span className="dot" />}
              {m}
            </span>
          ))}
        </div>
        {session.tags && session.tags.length > 0 && (
          <div className="recent-item-tags">
            {session.tags.map((tag) => (
              <button
                key={tag}
                className="recent-tag-pill"
                onClick={(e) => {
                  e.stopPropagation();
                  getLegacyActions().sessions.setRecentsFilter(tag);
                }}
                title={t('session.filterByTag').replace('{tag}', tag)}
              >#{tag}</button>
            ))}
          </div>
        )}
      </div>
      <div className="recent-item-actions">
        <button
          className="recent-item-tag-btn"
          data-tag-open="1"
          title={t('session.editTags')}
          data-i18n-title="session.editTags"
          onClick={(e) => onTag(session.id, e)}
          dangerouslySetInnerHTML={{ __html: TAG_ICON }}
        />
        <button
          className="recent-item-del"
          title={t('session.ctxDelete')}
          aria-label={t('session.ctxDelete')}
          data-i18n-title="session.ctxDelete"
          data-i18n-aria="session.ctxDelete"
          onClick={(e) => onDelete(session.id, e)}
          dangerouslySetInnerHTML={{ __html: DELETE_ICON }}
        />
      </div>
    </div>
  );
}

function useMinuteTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

/* Row identity is stabilised upstream by _stableSessionRow in main.js, so
   an unchanged session compares equal by reference here. The handlers are
   useCallback-stable, leaving nowTick as the only other trigger. */
const SessionRow = memo(SessionRowBase, (prev, next) => (
  prev.session === next.session
  && prev.isActive === next.isActive
  && prev.nowTick === next.nowTick
  && prev.onPick === next.onPick
  && prev.onTag === next.onTag
  && prev.onDelete === next.onDelete
  && prev.onDragStart === next.onDragStart
  && prev.onDragEnd === next.onDragEnd
));

function SessionListInner() {
  const snap = useSessionListSnapshot();
  const { sessions, currentSessionId, searchQuery, filter, fetchFailed } = snap;
  const nowTick = useMinuteTick();

  const handlePick = useCallback((id: string) => {
    // Optimistically flip the active row so the highlight appears on the
    // click frame instead of after loadSession's async fetch resolves.
    setCurrentSessionId(id);
    getLegacyActions().sessions.loadSession(id);
  }, []);

  const handleTag = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    getLegacyActions().sessions.openTagEditor(id, e.nativeEvent);
  }, []);

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    getLegacyActions().sessions.deleteSession(id, e.nativeEvent);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    getLegacyActions().sessions.onSessionDragStart(e.nativeEvent, id);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    getLegacyActions().sessions.onSessionDragEnd(e.nativeEvent);
  }, []);

  if (sessions.length === 0) {
    let emptyHtml: string;
    if (searchQuery) {
      const queryLabel = `<strong>&ldquo;${esc(searchQuery)}&rdquo;</strong>`;
      emptyHtml = `<div class="recents-empty">${t('session.noSearchMatch').replace('{query}', queryLabel)}<br>` +
        `<a href="#" onclick="setRecentsSearch('');return false">${t('session.clearSearch')}</a> ${t('session.showAllHint')}</div>`;
    } else if (fetchFailed && !filter) {
      emptyHtml = `<div class="recents-empty">${t('session.loadListFailed')}<br>` +
        `<a href="#" onclick="retryRecentsFetch();return false">${t('session.retry')}</a></div>`;
    } else if (filter) {
      const filterLabel = filter.indexOf('project:') === 0 ? 'Project' : '#' + filter;
      emptyHtml = `<div class="recents-empty">${t('session.noFilterMatch').replace('{filter}', `<strong>${esc(filterLabel)}</strong>`)}<br>` +
        `<a href="#" onclick="clearRecentsFilter();return false">${t('session.clearFilter')}</a> ${t('session.showAllHint')}</div>`;
    } else {
      emptyHtml = `<div class="recents-empty">${t('session.empty')}<br>${t('session.emptyHint')}</div>`;
    }
    return <div className="recents-list-content" dangerouslySetInnerHTML={{ __html: emptyHtml }} />;
  }

  const now = new Date();
  let prevGroup: string | null = null;

  return (
    <div className="recents-list-content">
      {sessions.map((session) => {
        const group = timeGroupLabel(session, now);
        const header = group !== prevGroup
          ? <div className="recents-time-label" key={`g-${group}-${session.id}`}>{group}</div>
          : null;
        prevGroup = group;
        return (
          <React.Fragment key={session.id}>
            {header}
            <SessionRow
              session={session}
              isActive={session.id === currentSessionId}
              nowTick={nowTick}
              onPick={handlePick}
              onTag={handleTag}
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

const LIST_ID = 'recentsList';

/**
 * Mount the React session list into the existing `#recentsList` element.
 * Uses `createRoot` + `render` since the element is empty (the legacy
 * renderer fills it with HTML strings). Idempotent.
 */
export function mountSessionList(): void {
  const container = document.getElementById(LIST_ID);
  if (!container) return;
  if (container.dataset.sessionListReactHydrated === '1') return;

  container.dataset.sessionListReactHydrated = '1';
  container.setAttribute('data-react-migration-runtime', 'session-list');

  installSessionListBridge();

  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <SessionListInner />
    </ErrorBoundary>,
  );
}
