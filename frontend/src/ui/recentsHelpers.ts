export function formatRelativeTime(ts: number, now?: number) {
  const diff = (now || Date.now()) - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return d + " days ago";
  return new Date(ts).toLocaleDateString();
}

export function getKnownTagsFromSessions(sessions?: readonly ({ tags?: string[] } | null)[] | null) {
  const seen: Record<string, number> = {};
  (sessions || []).forEach(function (s) {
    (s && s.tags || []).forEach(function (t) { if (t) seen[t] = 1; });
  });
  return Object.keys(seen).sort();
}

export function filterRecentsByChip<T extends { projectId?: string | null; tags?: string[] }>(recents: T[], recentsFilter?: string | null) {
  if (recentsFilter && recentsFilter !== "all") {
    /* Project filter: "project:<id>" */
    if (recentsFilter.indexOf("project:") === 0) {
      const projectId = recentsFilter.slice(8);
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
