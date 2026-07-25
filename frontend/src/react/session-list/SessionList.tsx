import { useCallback } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { installSessionListBridge, publishSessionList } from './sessionListStore';
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

function modeLabel(session: SessionItem): { label: string; cls: string } {
  if (session.kind === 'exam') return { label: 'Exam', cls: 'mode-exam' };
  const mode = session.mode;
  if (mode === 'chat') return { label: 'Chat', cls: 'mode-chat' };
  if (mode === 'tutor') return { label: 'Tutor', cls: 'mode-tutor' };
  if (session.phase === 'chat') return { label: 'Chat', cls: 'mode-chat' };
  return { label: 'Tutor', cls: 'mode-tutor' };
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
  onPick: (id: string) => void;
  onTag: (id: string, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

function SessionRow({ session, isActive, onPick, onTag, onDelete, onDragStart, onDragEnd }: SessionRowProps) {
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
      <span className={`recent-mode-badge ${ml.cls}`} title={ml.label}>{ml.label}</span>
      <div className="recent-item-main">
        <div className="recent-item-title-row">
          {session.pinned && (
            <span className="recent-item-pin-icon" title="Pinned" dangerouslySetInnerHTML={{ __html: PIN_ICON }} />
          )}
          <div className="recent-item-text">{esc(session.title || session.topic || '(untitled)')}</div>
          {label && <span className="recent-item-label">{esc(label)}</span>}
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
            {session.tags.map((t) => (
              <button
                key={t}
                className="recent-tag-pill"
                onClick={(e) => {
                  e.stopPropagation();
                  if (typeof window.setRecentsFilter === 'function') window.setRecentsFilter(t);
                }}
                title={`Filter by tag: ${t}`}
              >#{t}</button>
            ))}
          </div>
        )}
      </div>
      <div className="recent-item-actions">
        <button
          className="recent-item-tag-btn"
          data-tag-open="1"
          title="Edit tags"
          onClick={(e) => onTag(session.id, e)}
          dangerouslySetInnerHTML={{ __html: TAG_ICON }}
        />
        <button
          className="recent-item-del"
          title="Delete session"
          aria-label="Delete session"
          onClick={(e) => onDelete(session.id, e)}
          dangerouslySetInnerHTML={{ __html: DELETE_ICON }}
        />
      </div>
    </div>
  );
}

function SessionListInner() {
  const snap = useSessionListSnapshot();
  const { sessions, currentSessionId, searchQuery, filter, fetchFailed } = snap;

  const handlePick = useCallback((id: string) => {
    if (typeof window.loadSession === 'function') {
      window.loadSession(id);
    }
  }, []);

  const handleTag = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (typeof window.openTagEditor === 'function') {
      window.openTagEditor(id, e.nativeEvent);
    }
  }, []);

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (typeof window.actuallyDeleteSession === 'function') {
      window.actuallyDeleteSession(id, e.nativeEvent);
    }
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    if (typeof window.onSessionDragStart === 'function') {
      window.onSessionDragStart(e.nativeEvent, id);
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (typeof window.onSessionDragEnd === 'function') {
      window.onSessionDragEnd(e.nativeEvent);
    }
  }, []);

  if (sessions.length === 0) {
    let emptyHtml: string;
    if (searchQuery) {
      emptyHtml = `<div class="recents-empty">No sessions match <strong>&ldquo;${esc(searchQuery)}&rdquo;</strong>.<br>` +
        '<a href="#" onclick="setRecentsSearch(\'\');return false">Clear search</a> to see all sessions.</div>';
    } else if (fetchFailed && !filter) {
      emptyHtml = '<div class="recents-empty">Couldn\'t load sessions. Check your connection and try again.<br>' +
        '<a href="#" onclick="retryRecentsFetch();return false">Retry</a></div>';
    } else if (filter) {
      const filterLabel = filter.indexOf('project:') === 0 ? 'Project' : '#' + filter;
      emptyHtml = `<div class="recents-empty">No sessions match the <strong>${esc(filterLabel)}</strong> filter.<br>` +
        '<a href="#" onclick="clearRecentsFilter();return false">Clear filter</a> to see all sessions.</div>';
    } else {
      emptyHtml = '<div class="recents-empty">No recent sessions yet.<br>Start a topic to begin.</div>';
    }
    return <div className="recents-list-content" dangerouslySetInnerHTML={{ __html: emptyHtml }} />;
  }

  return (
    <div className="recents-list-content">
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          isActive={session.id === currentSessionId}
          onPick={handlePick}
          onTag={handleTag}
          onDelete={handleDelete}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      ))}
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
  root.render(<SessionListInner />);
}
