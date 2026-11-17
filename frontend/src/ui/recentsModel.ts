export function formatRelativeTime(value: string | number | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  return `${months}mo ago`;
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
