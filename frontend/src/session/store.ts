/* session/store.ts — URL helpers, session filtering, archive sweeping. */

export var RECENTS_CAP = 200;
export var ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function getChatIdFromURL(): string | null {
  return new URLSearchParams(location.search).get("chat") || null;
}

export function setChatIdInURL(id: string | null): void {
  var base = /^\/(library|projects|scheduled|plugins|exam)\/?$/.test(location.pathname) ? "/" : location.pathname;
  history.replaceState({ chatId: id }, "", id ? "/?chat=" + encodeURIComponent(id) : base);
}

export function pushChatIdToURL(id: string | null): void {
  var base = /^\/(library|projects|scheduled|plugins|exam)\/?$/.test(location.pathname) ? "/" : location.pathname;
  history.pushState({ chatId: id }, "", id ? "/?chat=" + encodeURIComponent(id) : base);
}

/* P_exam-route — exam sessions live under ?exam=<uuid> instead of ?chat=<uuid>.
 * Same URL-key shape (uuid) so refresh / shared link round-trips through the
 * same /api/sessions/<id> endpoint; only the query-param name differs so a
 * pasted chat link doesn't accidentally route into an exam view (and vice
 * versa). On boot, the two keys are mutually exclusive — callers decide
 * which wins (loadSession + loadExamSession handle their own keys). */
export function getExamIdFromURL(): string | null {
  return new URLSearchParams(location.search).get("exam") || null;
}

export function setExamIdInURL(id: string | null): void {
  var base = /^\/(library|projects|scheduled|plugins|exam)\/?$/.test(location.pathname) ? "/" : location.pathname;
  history.replaceState({ examId: id }, "", id ? "/?exam=" + encodeURIComponent(id) : base);
}

export function pushExamIdToURL(id: string | null): void {
  var base = /^\/(library|projects|scheduled|plugins|exam)\/?$/.test(location.pathname) ? "/" : location.pathname;
  history.pushState({ examId: id }, "", id ? "/?exam=" + encodeURIComponent(id) : base);
}

export function capSessions<T>(arr: T[]): T[] {
  return Array.isArray(arr) ? arr.slice(0, RECENTS_CAP) : [];
}

interface SessionLike {
  archivedAt?: number;
  pinned?: boolean;
  pinnedAt?: number;
  updated_at?: number;
  updatedAt?: number;
  created_at?: number;
  createdAt?: number;
  [key: string]: any;
}

export function getVisibleSessions(sessions: SessionLike[], now?: number): SessionLike[] {
  var swept = sweepExpiredArchivesFrom(sessions, now).sessions;
  var copy = swept.filter(function (s) { return !s || !s.archivedAt; });
  copy.sort(function (a, b) {
    /* Pinned sessions first, sorted by pin time descending. */
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    if (a.pinned && b.pinned) {
      var ap = a.pinnedAt || a.updated_at || a.updatedAt || 0;
      var bp = b.pinnedAt || b.updated_at || b.updatedAt || 0;
      return bp - ap;
    }
    var at = (a && (a.updated_at || a.updatedAt || a.created_at || a.createdAt)) || 0;
    var bt = (b && (b.updated_at || b.updatedAt || b.created_at || b.createdAt)) || 0;
    return bt - at;
  });
  return copy;
}

export function getArchivedSessionsFrom(sessions: SessionLike[], now?: number): SessionLike[] {
  var cutoff = (now || Date.now()) - ARCHIVE_RETENTION_MS;
  return (sessions || [])
    .filter(function (s) { return s && s.archivedAt && s.archivedAt > cutoff; })
    .sort(function (a, b) { return (b.archivedAt || 0) - (a.archivedAt || 0); });
}

export function sweepExpiredArchivesFrom(sessions: SessionLike[], now?: number): { sessions: SessionLike[]; changed: boolean } {
  var list = Array.isArray(sessions) ? sessions : [];
  var cutoff = (now || Date.now()) - ARCHIVE_RETENTION_MS;
  var next = list.filter(function (s) {
    return !s || !s.archivedAt || s.archivedAt > cutoff;
  });
  return { sessions: next, changed: next.length !== list.length };
}

interface DeletedSessionGuard {
  remember: (id: string) => void;
  forget: (id: string) => void;
  has: (id: string) => boolean;
  ageMs: (id: string) => number | null;
  clear: () => void;
}

export function createDeletedSessionGuard(limit?: number): DeletedSessionGuard {
  var deletedIds: Record<string, number> = Object.create(null);
  var max = limit || 50;
  return {
    remember: function (id: string) {
      if (!id) return;
      deletedIds[id] = Date.now();
      var keys = Object.keys(deletedIds);
      if (keys.length > max) {
        keys.sort(function (a, b) { return deletedIds[a] - deletedIds[b]; });
        var toDrop = keys.length - max;
        for (var i = 0; i < toDrop; i++) delete deletedIds[keys[i]];
      }
    },
    forget: function (id: string) {
      delete deletedIds[id];
    },
    has: function (id: string) {
      return !!(id && deletedIds[id]);
    },
    ageMs: function (id: string) {
      return id && deletedIds[id] ? Date.now() - deletedIds[id] : null;
    },
    clear: function () {
      deletedIds = Object.create(null);
    },
  };
}
