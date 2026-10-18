import { stateStore } from '../state/store.js';
import { getRecents } from './recents.ts';
import type { SessionRow } from './store.ts';
import { getRecentsFilter } from '../sidebar/sidebar.service.ts';
import { filterRecentsByChip } from '../ui/recentsHelpers.js';
import type { SessionItem } from '../react/session-list/types.ts';

interface SessionListWindow extends Window {
  RECENTS_SEARCH_QUERY?: string;
}

/* Hot-path session-list publisher.
 * Keep this module deliberately narrow: recents rendering needs a synchronous
 * snapshot publisher during normal app startup, but it does not need tag
 * editing, drag/drop project moves, or other organize interactions. */
const rowCache: Record<string, SessionItem> = Object.create(null);

export function sessionRowFields(s: SessionRow): SessionItem {
  return {
    id: s.id,
    title: (s.title as string) || '',
    projectId: typeof s.projectId === 'string' ? s.projectId : typeof s.project_id === 'string' ? s.project_id : null,
    topic: (s.topic as string) || '',
    updatedAt: (s.updated_at || s.updatedAt || null) as string | number | null,
    createdAt: (s.created_at || s.createdAt || null) as string | number | null,
    totalQ: (s.total_q || s.totalQ || 0) as number,
    mode: (s.mode as string) || '',
    phase: (s.phase as string) || '',
    kind: (s.kind as string) || '',
    pinned: !!s.pinned,
    tags: Array.isArray(s.tags) ? s.tags as string[] : [],
    label: '',
    archivedAt: typeof s.archivedAt === 'number' ? s.archivedAt : null,
    branchedFrom: (s.branchedFrom || null) as SessionItem['branchedFrom'],
  };
}

export function sameSessionRow(a: SessionItem | undefined, b: SessionItem): boolean {
  if (!a || !b) return false;
  if (a.title !== b.title || a.topic !== b.topic || a.updatedAt !== b.updatedAt
    || a.createdAt !== b.createdAt || a.totalQ !== b.totalQ || a.mode !== b.mode
    || a.phase !== b.phase || a.kind !== b.kind || a.pinned !== b.pinned
    || a.label !== b.label || a.archivedAt !== b.archivedAt || a.projectId !== b.projectId) return false;
  if (a.branchedFrom !== b.branchedFrom) {
    if (!a.branchedFrom || !b.branchedFrom) return false;
    if (a.branchedFrom.sessionId !== b.branchedFrom.sessionId
      || a.branchedFrom.messageId !== b.branchedFrom.messageId
      || a.branchedFrom.reExplain !== b.branchedFrom.reExplain) return false;
  }
  if (a.tags !== b.tags) {
    const at = a.tags || [];
    const bt = b.tags || [];
    if (at.length !== bt.length) return false;
    for (let i = 0; i < at.length; i++) {
      if (at[i] !== bt[i]) return false;
    }
  }
  return true;
}

export function stableSessionRow(s: SessionRow): SessionItem {
  const next = sessionRowFields(s);
  const prev = rowCache[next.id];
  if (sameSessionRow(prev, next)) return prev;
  rowCache[next.id] = next;
  return next;
}

export function publishSessionList(): void {
  try {
    const bridge = window.__socratesSessionListBridge;
    if (!bridge || typeof bridge.publish !== 'function') return;

    const allSessions = getRecents();
    const filter = getRecentsFilter();
    let sessions = filterRecentsByChip(allSessions, filter) as SessionRow[];
    const searchQ = (((window as SessionListWindow).RECENTS_SEARCH_QUERY || '')).trim().toLowerCase();
    if (searchQ) {
      sessions = sessions.filter(function (s) {
        const hay = (((s.title as string) || '') + ' ' + ((s.topic as string) || '')).toLowerCase();
        return hay.indexOf(searchQ) !== -1;
      });
    }

    const live: Record<string, boolean> = Object.create(null);
    for (let i = 0; i < allSessions.length; i++) {
      if (allSessions[i] && allSessions[i].id) live[allSessions[i].id] = true;
    }
    for (const key of Object.keys(rowCache)) {
      if (!live[key]) delete rowCache[key];
    }

    bridge.publish({
      sessions: sessions.map(stableSessionRow),
      currentSessionId: stateStore.read('currentSessionId') as string | null,
      searchQuery: searchQ,
      filter,
      fetchFailed: !!window.SERVER_SESSIONS_FETCH_FAILED,
    });
  } catch {
    /* The React bridge is best-effort during boot/teardown. */
  }
}
