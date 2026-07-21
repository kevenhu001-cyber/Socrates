export function formatRelativeTime(ts, now) {
  var diff = (now || Date.now()) - ts;
  var m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  var h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  var d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return d + " days ago";
  return new Date(ts).toLocaleDateString();
}

export function getKnownTagsFromSessions(sessions) {
  var seen = {};
  (sessions || []).forEach(function (s) {
    (s && s.tags || []).forEach(function (t) { if (t) seen[t] = 1; });
  });
  return Object.keys(seen).sort();
}

export function filterRecentsByChip(recents, recentsFilter) {
  if (recentsFilter && recentsFilter !== "all") {
    /* Project filter: "project:<id>" */
    if (recentsFilter.indexOf("project:") === 0) {
      var projectId = recentsFilter.slice(8);
      return (recents || []).filter(function (s) {
        return s.projectId === projectId || (!s.projectId && !projectId);
      });
    }
    /* Tag filter */
    return (recents || []).filter(function (s) {
      return Array.isArray(s.tags) && s.tags.indexOf(recentsFilter) >= 0;
    });
  }
  return recents;
}
