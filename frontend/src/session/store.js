export var RECENTS_CAP = 200;
export var ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/* Server JSON ships archivedAt as an ISO string; optimistic UI stamps use
   ms numbers. Normalise before any retention comparison — `iso > msNumber`
   is always false under JS coercion and silently emptied Storage. */
function archiveMs(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  var parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function getChatIdFromURL() {
  return new URLSearchParams(location.search).get("chat") || null;
}

export function setChatIdInURL(id) {
  var base = /^\/(library|projects|scheduled|plugins|exam)\/?$/.test(location.pathname) ? "/" : location.pathname;
  history.replaceState({ chatId: id }, "", id ? "/?chat=" + encodeURIComponent(id) : base);
}

export function pushChatIdToURL(id) {
  var base = /^\/(library|projects|scheduled|plugins|exam)\/?$/.test(location.pathname) ? "/" : location.pathname;
  history.pushState({ chatId: id }, "", id ? "/?chat=" + encodeURIComponent(id) : base);
}

/* P_exam-route — exam sessions live under ?exam=<uuid> instead of ?chat=<uuid>.
 * Same URL-key shape (uuid) so refresh / shared link round-trips through the
 * same /api/sessions/<id> endpoint; only the query-param name differs so a
 * pasted chat link doesn't accidentally route into an exam view (and vice
 * versa). On boot, the two keys are mutually exclusive — callers decide
 * which wins (loadSession + loadExamSession handle their own keys). */
export function getExamIdFromURL() {
  return new URLSearchParams(location.search).get("exam") || null;
}

export function setExamIdInURL(id) {
  var base = /^\/(library|projects|scheduled|plugins|exam)\/?$/.test(location.pathname) ? "/" : location.pathname;
  history.replaceState({ examId: id }, "", id ? "/?exam=" + encodeURIComponent(id) : base);
}

export function pushExamIdToURL(id) {
  var base = /^\/(library|projects|scheduled|plugins|exam)\/?$/.test(location.pathname) ? "/" : location.pathname;
  history.pushState({ examId: id }, "", id ? "/?exam=" + encodeURIComponent(id) : base);
}

export function capSessions(arr) {
  return Array.isArray(arr) ? arr.slice(0, RECENTS_CAP) : [];
}

export function getVisibleSessions(sessions, now) {
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

export function getArchivedSessionsFrom(sessions, now) {
  var cutoff = (now || Date.now()) - ARCHIVE_RETENTION_MS;
  return (sessions || [])
    .filter(function (s) { return s && archiveMs(s.archivedAt) > cutoff; })
    .sort(function (a, b) { return archiveMs(b.archivedAt) - archiveMs(a.archivedAt); });
}

export function sweepExpiredArchivesFrom(sessions, now) {
  var list = Array.isArray(sessions) ? sessions : [];
  var cutoff = (now || Date.now()) - ARCHIVE_RETENTION_MS;
  var next = list.filter(function (s) {
    return !s || !archiveMs(s.archivedAt) || archiveMs(s.archivedAt) > cutoff;
  });
  return { sessions: next, changed: next.length !== list.length };
}

export function createDeletedSessionGuard(limit) {
  var deletedIds = Object.create(null);
  var max = limit || 50;
  return {
    remember: function (id) {
      if (!id) return;
      deletedIds[id] = Date.now();
      var keys = Object.keys(deletedIds);
      if (keys.length > max) {
        keys.sort(function (a, b) { return deletedIds[a] - deletedIds[b]; });
        var toDrop = keys.length - max;
        for (var i = 0; i < toDrop; i++) delete deletedIds[keys[i]];
      }
    },
    forget: function (id) {
      delete deletedIds[id];
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
