/* session/store.ts — pure session-list/URL helpers.
 *
 * Everything here is DOM-read-only or arithmetic; no fetch, no rendering.
 * `SessionRow` is the loose server/optimistic row shape: the API ships
 * snake_case timestamps, optimistic UI stamps camelCase ms numbers, so both
 * spellings are accepted and coerced through `timeMs()` before comparison.
 */

export const RECENTS_CAP = 200;
export const ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** A recents row as it arrives from the server or from optimistic UI. */
export interface SessionRow {
  id: string;
  title?: string | null;
  topic?: string | null;
  pinned?: boolean;
  pinnedAt?: number | string | null;
  archivedAt?: number | string | null;
  updated_at?: number | string | null;
  updatedAt?: number | string | null;
  created_at?: number | string | null;
  createdAt?: number | string | null;
  [key: string]: unknown;
}

/** Server JSON ships archivedAt as an ISO string; optimistic UI stamps use
 *  ms numbers. Normalise before any retention comparison — `iso > msNumber`
 *  is always false under JS coercion and silently emptied Storage. */
function timeMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

const ROUTE_PREFIX_RE = /^\/(library|projects|scheduled|plugins|exam)\/?$/;

function routeBase(): string {
  return ROUTE_PREFIX_RE.test(location.pathname) ? '/' : location.pathname;
}

export function getChatIdFromURL(): string | null {
  return new URLSearchParams(location.search).get('chat') || null;
}

export function setChatIdInURL(id: string | null): void {
  const base = routeBase();
  history.replaceState({ chatId: id }, '', id ? '/?chat=' + encodeURIComponent(id) : base);
}

/* P_url-single-write — clear BOTH the ?chat= and ?exam= route keys in one
 * history.replaceState. The new-chat reset used to call setChatIdInURL(null)
 * and then setExamIdInURL(null) back to back; both resolve to the same
 * `base` URL (no query string at all), so the second call re-wrote an
 * identical URL and left a different history.state object. Nothing reads
 * history.state.chatId / .examId anywhere in the app, so the second write
 * was pure cost — and it was the single largest frame in the new-chat
 * click profile. One write does the same job. */
export function clearSessionRouteInURL(): void {
  history.replaceState({ chatId: null, examId: null }, '', routeBase());
}

export function pushChatIdToURL(id: string | null): void {
  const base = routeBase();
  history.pushState({ chatId: id }, '', id ? '/?chat=' + encodeURIComponent(id) : base);
}

/* P_exam-route — exam sessions live under ?exam=<uuid> instead of ?chat=<uuid>.
 * Same URL-key shape (uuid) so refresh / shared link round-trips through the
 * same /api/sessions/<id> endpoint; only the query-param name differs so a
 * pasted chat link doesn't accidentally route into an exam view (and vice
 * versa). On boot, the two keys are mutually exclusive — callers decide
 * which wins (loadSession + loadExamSession handle their own keys). */
export function getExamIdFromURL(): string | null {
  return new URLSearchParams(location.search).get('exam') || null;
}

export function setExamIdInURL(id: string | null): void {
  const base = routeBase();
  history.replaceState({ examId: id }, '', id ? '/?exam=' + encodeURIComponent(id) : base);
}

export function pushExamIdToURL(id: string | null): void {
  const base = routeBase();
  history.pushState({ examId: id }, '', id ? '/?exam=' + encodeURIComponent(id) : base);
}

export function capSessions(arr: unknown): SessionRow[] {
  return Array.isArray(arr) ? (arr.slice(0, RECENTS_CAP) as SessionRow[]) : [];
}

function sessionSortTime(value: SessionRow['pinnedAt'] | SessionRow['updated_at'] | SessionRow['updatedAt'] | SessionRow['created_at'] | SessionRow['createdAt']): number {
  return timeMs(value);
}

function pinnedSessionTime(session: SessionRow): number {
  return sessionSortTime(session.pinnedAt || session.updated_at || session.updatedAt);
}

function recentSessionTime(session: SessionRow): number {
  return sessionSortTime(session.updated_at || session.updatedAt || session.created_at || session.createdAt);
}

function compareVisibleSessions(a: SessionRow, b: SessionRow): number {
  if (a.pinned && !b.pinned) return -1;
  if (!a.pinned && b.pinned) return 1;
  if (a.pinned && b.pinned) return pinnedSessionTime(b) - pinnedSessionTime(a);
  return recentSessionTime(b) - recentSessionTime(a);
}

export function getVisibleSessions(sessions: ReadonlyArray<SessionRow>, now?: number): SessionRow[] {
  const swept = sweepExpiredArchivesFrom(sessions, now).sessions;
  const copy = swept.filter(function (s) { return !s || !s.archivedAt; });
  copy.sort(compareVisibleSessions);
  return copy;
}

export function getArchivedSessionsFrom(sessions: ReadonlyArray<SessionRow> | null | undefined, now?: number): SessionRow[] {
  const cutoff = (now || Date.now()) - ARCHIVE_RETENTION_MS;
  return (sessions || [])
    .filter(function (s) { return s && timeMs(s.archivedAt) > cutoff; })
    .sort(function (a, b) { return timeMs(b.archivedAt) - timeMs(a.archivedAt); });
}

export interface SweepResult {
  sessions: SessionRow[];
  changed: boolean;
}

export function sweepExpiredArchivesFrom(sessions: unknown, now?: number): SweepResult {
  const list: SessionRow[] = Array.isArray(sessions) ? sessions as SessionRow[] : [];
  const cutoff = (now || Date.now()) - ARCHIVE_RETENTION_MS;
  const next = list.filter(function (s) {
    return !s || !timeMs(s.archivedAt) || timeMs(s.archivedAt) > cutoff;
  });
  return { sessions: next, changed: next.length !== list.length };
}

/** Bounded tombstone set for deleted session ids. */
export interface DeletedSessionGuard {
  remember(id: string | null | undefined): void;
  forget(id: string | null | undefined): void;
  has(id: string | null | undefined): boolean;
  ageMs(id: string | null | undefined): number | null;
  clear(): void;
}

export function createDeletedSessionGuard(limit?: number): DeletedSessionGuard {
  let deletedIds: Record<string, number> = Object.create(null);
  const max = limit || 50;
  return {
    remember: function (id) {
      if (!id) return;
      deletedIds[id] = Date.now();
      const keys = Object.keys(deletedIds);
      if (keys.length > max) {
        keys.sort(function (a, b) { return deletedIds[a] - deletedIds[b]; });
        const toDrop = keys.length - max;
        for (let i = 0; i < toDrop; i++) delete deletedIds[keys[i]];
      }
    },
    forget: function (id) {
      if (id) delete deletedIds[id];
    },
    has: function (id) {
      return !!(id && deletedIds[id]);
    },
    ageMs: function (id) {
      return id && deletedIds[id] ? Date.now() - deletedIds[id] : null;
    },
    clear: function () {
      deletedIds = Object.create(null);
    },
  };
}
