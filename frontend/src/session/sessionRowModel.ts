import type { SessionItem } from '../react/session-list/types.ts';
import type { SessionRow } from './store.ts';

function projectIdOf(row: SessionRow): string | null {
  if (typeof row.projectId === 'string') return row.projectId;
  if (typeof row.project_id === 'string') return row.project_id;
  return null;
}

export function sessionRowFields(row: SessionRow): SessionItem {
  return {
    id: row.id,
    title: (row.title as string) || '',
    projectId: projectIdOf(row),
    topic: (row.topic as string) || '',
    updatedAt: (row.updated_at || row.updatedAt || null) as string | number | null,
    createdAt: (row.created_at || row.createdAt || null) as string | number | null,
    totalQ: (row.total_q || row.totalQ || 0) as number,
    mode: (row.mode as string) || '',
    phase: (row.phase as string) || '',
    kind: (row.kind as string) || '',
    pinned: !!row.pinned,
    tags: Array.isArray(row.tags) ? row.tags as string[] : [],
    label: '',
    archivedAt: typeof row.archivedAt === 'number' ? row.archivedAt : null,
    branchedFrom: (row.branchedFrom || null) as SessionItem['branchedFrom'],
  };
}

function sameSessionRowFields(a: SessionItem, b: SessionItem): boolean {
  return a.title === b.title && a.topic === b.topic && a.updatedAt === b.updatedAt
    && a.createdAt === b.createdAt && a.totalQ === b.totalQ && a.mode === b.mode
    && a.phase === b.phase && a.kind === b.kind && a.pinned === b.pinned
    && a.label === b.label && a.archivedAt === b.archivedAt && a.projectId === b.projectId;
}

function sameBranchSource(a: SessionItem, b: SessionItem): boolean {
  if (a.branchedFrom === b.branchedFrom) return true;
  if (!a.branchedFrom || !b.branchedFrom) return false;
  return a.branchedFrom.sessionId === b.branchedFrom.sessionId
    && a.branchedFrom.messageId === b.branchedFrom.messageId
    && a.branchedFrom.reExplain === b.branchedFrom.reExplain;
}

function sameTags(a: SessionItem, b: SessionItem): boolean {
  if (a.tags === b.tags) return true;
  const aTags = a.tags || [];
  const bTags = b.tags || [];
  if (aTags.length !== bTags.length) return false;
  for (let index = 0; index < aTags.length; index++) {
    if (aTags[index] !== bTags[index]) return false;
  }
  return true;
}

export function sameSessionRow(a: SessionItem | undefined, b: SessionItem): boolean {
  if (!a || !b) return false;
  return sameSessionRowFields(a, b) && sameBranchSource(a, b) && sameTags(a, b);
}
