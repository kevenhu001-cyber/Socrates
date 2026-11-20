/* Transport paging state for the sidebar's recent-session metadata.
 * Rendering/windowing remains in VirtualSessionTimeline. */
export const RECENTS_PAGE_SIZE = 40;

export interface SessionListPagingSnapshot {
  initialized: boolean;
  nextCursor: string | null;
  loading: boolean;
  failed: boolean;
  loadedPages: number;
}

let snapshot: SessionListPagingSnapshot = {
  initialized: false,
  nextCursor: null,
  loading: false,
  failed: false,
  loadedPages: 0,
};
const listeners = new Set<() => void>();

export function getSessionListPagingSnapshot(): SessionListPagingSnapshot {
  return snapshot;
}

export function subscribeSessionListPaging(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function patchSessionListPaging(patch: Partial<SessionListPagingSnapshot>): void {
  const next = { ...snapshot, ...patch };
  if (
    Object.keys(patch).every(
      (key) =>
        snapshot[key as keyof SessionListPagingSnapshot] ===
        next[key as keyof SessionListPagingSnapshot],
    )
  )
    return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function resetSessionListPaging(): void {
  patchSessionListPaging({
    initialized: false,
    nextCursor: null,
    loading: false,
    failed: false,
    loadedPages: 0,
  });
}
