import type { SessionItem } from './types';

export interface SessionProjectGroup {
  id: string;
  name: string;
  sessions: SessionItem[];
}

/** Preserve recency within each group and keep pinned chats easy to reach. */
export function groupSessionsByProject(
  sessions: ReadonlyArray<SessionItem>,
  projects: ReadonlyArray<{ id: string; name: string }>,
  labels: { pinned: string; other: string; project: string },
): SessionProjectGroup[] {
  const names = new Map(projects.map((project) => [project.id, project.name]));
  const groups = new Map<string, SessionProjectGroup>();
  const pinned: SessionProjectGroup = { id: 'pinned', name: labels.pinned, sessions: [] };
  const other: SessionProjectGroup = { id: 'other', name: labels.other, sessions: [] };
  for (const session of sessions) {
    if (session.pinned) { pinned.sessions.push(session); continue; }
    if (!session.projectId) { other.sessions.push(session); continue; }
    let group = groups.get(session.projectId);
    if (!group) {
      group = { id: `project:${session.projectId}`, name: names.get(session.projectId) || labels.project, sessions: [] };
      groups.set(session.projectId, group);
    }
    group.sessions.push(session);
  }
  return [pinned, ...groups.values(), other].filter((group) => group.sessions.length);
}
