import { hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import { createRoot } from 'react-dom/client';
import { Pin, Tag } from 'lucide-react';

import { getLegacyActions, getLegacyActionsOrNull, t } from '../legacy/gateway.ts';
import { AnchoredMenu } from '../menu/AnchoredMenu';
import { getApiFetch, getCurrentLang } from '../legacy/gateway.ts';
import { ErrorBoundary } from '../ErrorBoundary';
import { installSessionListBridge, setCurrentSessionId } from './sessionList.bridge';
import { useSessionListSnapshot, formatRelativeTime } from './sessionList.bridge';
import { detailCache } from '../../session/detailCache.js';
import { refreshCachedProjects } from '../../projects/projectCache.ts';
import { clearRecentsFilter, setRecentsFilter } from '../../sidebar/sidebar.service';
import { sidebarIcons } from '../../sidebar/sidebarIcons';
import type { SessionItem } from './types';

const SHARE_ICON = sidebarIcons.share;

const RENAME_ICON = sidebarIcons.rename;

const ARCHIVE_ICON = sidebarIcons.archive;

const DELETE_ICON = sidebarIcons.delete;

const PROJECT_ICON = sidebarIcons.projects;

const CHEVRON_RIGHT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="m9.5 6 6 6-6 6"/></svg>';

const PIN_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><path d="M12 2v10l4 4v2H8v-2l4-4V2"/></svg>';

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
  onArchive: (id: string, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

function SessionRowBase({ session, isActive, onPick, onTag, onArchive, onDelete, onDragStart, onDragEnd }: SessionRowProps) {
  const ml = modeLabel(session);
  const meta = buildMeta(session);
  const sid = safeId(session.id);
  const label = session.label || '';
  /* Phone drawers expose the row overflow as a "⋯" affordance (the desktop
     keeps the hover icon pair). Outside clicks close it; clicks inside the
     row (overflow toggle + menu item buttons) are handled by their own
     handlers so a capture-phase close cannot swallow the archive/tag/delete
     click before React sees it. */
  const [actionsOpen, setActionsOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setActionsOpen(false), []);
  const [renaming, setRenaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }> | null>(null);
  const copy = (zh: string, en: string) => getCurrentLang() === 'zh' ? zh : en;
  const update = async (patch: { title?: string; pinned?: boolean; projectId?: string }) => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await getLegacyActions().sessions.updateSessionMetadata(session.id, patch);
      setRenaming(false);
      setProjects(null);
      closeMenu();
    } catch { setError(copy('保存失败，请重试', 'Could not save. Try again.')); }
    finally { setSaving(false); }
  };


  return (
    <div
      ref={rowRef}
      className={`btn btn-ghost btn-touch recent-item${isActive ? ' active' : ''}${session.pinned ? ' pinned' : ''}${actionsOpen ? ' actions-open' : ''}`}
      data-recent-id={sid}
      data-recent-actual={session.id}
      draggable
      onDragStart={(e) => onDragStart(e, session.id)}
      onDragEnd={onDragEnd}
      onPointerEnter={() => { try { detailCache.prefetch(session.id); } catch (_) {} }}
      onTouchStart={() => { try { detailCache.prefetch(session.id); } catch (_) {} }}
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
          {renaming ? <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const title = new FormData(e.currentTarget).get('title')?.toString().trim();
            if (title) void update({ title });
          }}><input name="title" aria-label={t('session.ctxRename')} defaultValue={session.title || session.topic || ''}
            maxLength={255} autoFocus disabled={saving} onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(false); }} /></form>
          : <div className="recent-item-text">{session.title || session.topic || '(untitled)'}</div>}
          {error && <span role="alert">{error}</span>}
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
                  setRecentsFilter(tag);
                }}
                title={t('session.filterByTag').replace('{tag}', tag)}
              >#{tag}</button>
            ))}
          </div>
        )}
      </div>
      <div className="recent-item-actions">
        <button
          ref={menuAnchor}
          className="btn-icon recent-item-overflow"
          type="button"
          title={t('session.moreActions')}
          aria-label={t('session.moreActions')}
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
          data-i18n-title="session.moreActions"
          data-i18n-aria="session.moreActions"
          onClick={(e) => {
            e.stopPropagation();
            setActionsOpen((open) => !open);
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2.1" /><circle cx="12" cy="12" r="2.1" /><circle cx="19" cy="12" r="2.1" /></svg>
        </button>
        {/* The ⋯ trigger opens this wrap as an anchored dropdown with
            icon + label rows on every width — desktop reveals the trigger
            on row hover/focus; phones show it persistently. */}
        {actionsOpen && <AnchoredMenu anchor={menuAnchor} onClose={closeMenu} spill className="recent-item-menu is-open">
          {projects ? <>
            <button role="menuitem" onClick={() => setProjects(null)}>{copy("返回", "Back")}</button>
            {projects.length ? projects.map((project) => <button key={project.id} role="menuitem" disabled={saving} onClick={() => void update({ projectId: project.id })}>{project.name}</button>) : <span>{copy("暂无项目，请先创建项目", "Create a project first")}</span>}
          </> : <>
          <button
            className="btn-icon recent-item-menu-row recent-item-share"
            type="button"
            role="menuitem"
            title={t('session.ctxShare')}
            onClick={() => {
              setActionsOpen(false);
              getLegacyActionsOrNull()?.messages.openShareModal(session.id);
            }}
          >
            <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: SHARE_ICON }} />
            <span className="recent-item-action-text">{t('session.ctxShare')}</span>
          </button>
          <button
            className="btn-icon recent-item-menu-row recent-item-rename"
            type="button"
            role="menuitem"
            title={t('session.ctxRename')}
            onClick={(e) => {
              setActionsOpen(false);
              e.stopPropagation();
              setRenaming(true);
            }}
          >
            <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: RENAME_ICON }} />
            <span className="recent-item-action-text">{t('session.ctxRename')}</span>
          </button>
          <button
            className="btn-icon recent-item-menu-row recent-item-tag-btn"
            type="button"
            role="menuitem"
            title={t('session.editTags')}
            aria-label={t('session.editTags')}
            onClick={(e) => { setActionsOpen(false); onTag(session.id, e); }}
          >
            <span className="recent-item-action-icon"><Tag strokeWidth={1.8} aria-hidden="true" /></span>
            <span className="recent-item-action-text">{t('session.editTags')}</span>
          </button>
          <div className="recent-item-menu-divider" />
          <button
            className="btn-icon recent-item-menu-row recent-item-pin"
            type="button"
            role="menuitem"
            title={t(session.pinned ? 'session.ctxUnpin' : 'session.ctxPin')}
            onClick={() => {
              setActionsOpen(false);
              void update({ pinned: !session.pinned });
            }}
          >
            <span className="recent-item-action-icon"><Pin strokeWidth={1.8} aria-hidden="true" style={{ transform: 'rotate(45deg)' }} /></span>
            <span className="recent-item-action-text">{t(session.pinned ? 'session.ctxUnpin' : 'session.ctxPin')}</span>
          </button>
          <button
            className="btn-icon recent-item-menu-row recent-item-archive"
            type="button"
            role="menuitem"
            data-archive-session="1"
            title={t('session.ctxArchive')}
            aria-label={t('session.ctxArchive')}
            data-i18n-title="session.ctxArchive"
            data-i18n-aria="session.ctxArchive"
            onClick={(e) => { setActionsOpen(false); onArchive(session.id, e); }}
          >
            <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: ARCHIVE_ICON }} />
            <span className="recent-item-action-text" data-i18n-key="session.ctxArchive">{t('session.ctxArchive')}</span>
          </button>
          <button
            className="btn-icon recent-item-menu-row recent-item-del"
            type="button"
            role="menuitem"
            title={t('session.ctxDelete')}
            aria-label={t('session.ctxDelete')}
            data-i18n-title="session.ctxDelete"
            data-i18n-aria="session.ctxDelete"
            onClick={(e) => { setActionsOpen(false); onDelete(session.id, e); }}
          >
            <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: DELETE_ICON }} />
            <span className="recent-item-action-text" data-i18n-key="session.ctxDelete">{t('session.ctxDelete')}</span>
          </button>
          <div className="recent-item-menu-divider" />
          <button
            className="btn-icon recent-item-menu-row recent-item-project"
            type="button"
            role="menuitem"
            title={t('session.ctxMoveToProject')}
            onClick={() => {
              setActionsOpen(false);
              setActionsOpen(true);
              const fetchApi = getApiFetch();
              if (!fetchApi) {
                setError(copy('项目加载失败，请重试', 'Could not load projects. Try again.'));
                return;
              }
              void refreshCachedProjects(() => fetchApi('/api/projects'))
                .then((rows) => setProjects([...rows]))
                .catch(() => setError(copy('项目加载失败，请重试', 'Could not load projects. Try again.')));
            }}
          >
            <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: PROJECT_ICON }} />
            <span className="recent-item-action-text">{t('session.ctxMoveToProject')}</span>
            <span className="recent-item-action-trailing" dangerouslySetInnerHTML={{ __html: CHEVRON_RIGHT }} />
          </button>
        </>}
        </AnchoredMenu>}
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
  && prev.onArchive === next.onArchive
  && prev.onDelete === next.onDelete
  && prev.onDragStart === next.onDragStart
  && prev.onDragEnd === next.onDragEnd
));

/* Shared empty-state chrome — text only, centred on phones via
   polish/sidebar.css (the flex rules are scoped to
   @media (max-width: 768px)). Desktop keeps the unstyled fallback. */
function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="recents-empty">
      <div className="recents-empty-text">{children}</div>
    </div>
  );
}

function SessionListInner() {
  const snap = useSessionListSnapshot();
  const { sessions, currentSessionId, searchQuery, filter, fetchFailed } = snap;
  const nowTick = useMinuteTick();

  useEffect(() => {
    if (sessions.length > 0) {
      const topIds = sessions.map((s) => s.id).filter(Boolean);
      try { detailCache.idleWarmup(topIds); } catch (_) {}
    }
  }, [sessions]);

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

  const handleArchive = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    getLegacyActions().sessions.archiveSession(id, e.nativeEvent);
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
    const sessionActions = getLegacyActions().sessions;
    let empty: React.ReactNode;
    if (searchQuery) {
      const [before, after] = t('session.noSearchMatch').split('{query}');
      empty = (
        <EmptyState>
          {before}<strong>&ldquo;{searchQuery}&rdquo;</strong>{after}<br />
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              sessionActions.setRecentsSearch('');
            }}
          >{t('session.clearSearch')}</a> {t('session.showAllHint')}
        </EmptyState>
      );
    } else if (fetchFailed && !filter) {
      empty = (
        <EmptyState>
          {t('session.loadListFailed')}<br />
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              sessionActions.retryRecentsFetch();
            }}
          >{t('session.retry')}</a>
        </EmptyState>
      );
    } else if (filter) {
      const filterLabel = filter.indexOf('project:') === 0 ? 'Project' : '#' + filter;
      const [before, after] = t('session.noFilterMatch').split('{filter}');
      empty = (
        <EmptyState>
          {before}<strong>{filterLabel}</strong>{after}<br />
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              clearRecentsFilter();
            }}
          >{t('session.clearFilter')}</a> {t('session.showAllHint')}
        </EmptyState>
      );
    } else {
      empty = (
        <EmptyState>
          {t('session.empty')}<br />{t('session.emptyHint')}
        </EmptyState>
      );
    }
    return <div className="recents-list-content">{empty}</div>;
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

const LIST_ID = 'recentsList';

/**
 * Mount the React session list into the existing `#recentsList` element.
 * Uses `createRoot` + `render` since the element is empty (the legacy
 * renderer fills it with HTML strings). Idempotent.
 */
export function mountSessionList(): void {
  const container = document.getElementById(LIST_ID);
  if (!container) return;
  if (hostIsMountedBy(container, 'session-list')) return;

  installSessionListBridge();

  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <SessionListInner />
    </ErrorBoundary>,
  );
  markHostMountedBy(container, 'session-list');
}
