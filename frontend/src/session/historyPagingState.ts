/* session/historyPagingState.ts — R7 phase 2 paging state for the open
 * transcript.
 *
 * A long conversation now opens from one tail page (GET /api/sessions/:id
 * ?tail=N); older pages are read on demand through GET /:id/messages. This
 * module holds only the observable state of that walk plus the hook the
 * loader registers, so the React message list can subscribe without pulling
 * the session loader, persistence, and restore modules into its chunk. The
 * network/restore side lives in session/historyPaging.ts.
 */

export interface HistoryCursor {
  createdAt: string;
  id: string;
}

export interface HistoryPagingSnapshot {
  /** Session the state belongs to; null before any chat session loads. */
  sessionId: string | null;
  /** The server still holds rows older than the oldest loaded one. */
  hasMore: boolean;
  /** At least one older page was loaded into this transcript. */
  pagedBack: boolean;
  loading: boolean;
  failed: boolean;
}

export interface OlderHistoryRequest {
  /** Runs synchronously right before the older rows are published, so a
      caller can capture its scroll anchor against the pre-prepend DOM. */
  beforeApply?: () => void;
  /** Page size override (1..200). */
  limit?: number;
}

/** Newest rows fetched when a session opens. The client-side LLM history
    keeps the last 60 messages verbatim (chat/history.ts), so a tail of 100
    always covers that window. */
export const TAIL_PAGE_SIZE = 100;

export interface MessagesPage {
  hasMore?: boolean;
  cursor?: HistoryCursor | null;
  total?: number;
  /** Rows older than the tail at fetch time; derived on arrival so a cached
      response whose messages grow through saves keeps a correct count. */
  older?: number;
}

interface PagedDetail {
  messages?: unknown;
  messagesPage?: MessagesPage | null;
  [key: string]: unknown;
}

/** Detail URL used by every GET of a session for display. */
export function sessionDetailPath(id: string): string {
  return '/api/sessions/' + encodeURIComponent(id) + '?tail=' + TAIL_PAGE_SIZE;
}

export function validCursor(cursor: unknown): cursor is HistoryCursor {
  const value = cursor as HistoryCursor | null | undefined;
  return Boolean(value && typeof value.createdAt === 'string' && typeof value.id === 'string');
}

/** Normalize a freshly fetched detail response's page metadata in place. */
export function normalizeDetailPage<T extends PagedDetail | null | undefined>(response: T): T {
  if (!response || typeof response !== 'object') return response;
  const page = response.messagesPage;
  if (!page || typeof page !== 'object') {
    if ('messagesPage' in response) delete response.messagesPage;
    return response;
  }
  const loaded = Array.isArray(response.messages) ? response.messages.length : 0;
  const hasMore = page.hasMore === true && validCursor(page.cursor);
  const total = Number.isFinite(page.total) ? Number(page.total) : loaded;
  response.messagesPage = {
    hasMore,
    cursor: hasMore ? page.cursor : null,
    total,
    older: hasMore ? Math.max(0, total - loaded) : 0,
  };
  return response;
}

/** Rows the server holds beyond the ones in `response.messages`. */
export function olderRowCount(response: PagedDetail | null | undefined): number {
  const page = response && response.messagesPage;
  return page && page.hasMore && Number.isFinite(page.older) ? Number(page.older) : 0;
}

type OlderHistoryLoader = (request: OlderHistoryRequest) => Promise<number>;
type Listener = () => void;

const IDLE: HistoryPagingSnapshot = Object.freeze({
  sessionId: null,
  hasMore: false,
  pagedBack: false,
  loading: false,
  failed: false,
});

let snapshot: HistoryPagingSnapshot = IDLE;
let loader: OlderHistoryLoader | null = null;
const listeners = new Set<Listener>();

export function getHistoryPagingSnapshot(): HistoryPagingSnapshot {
  return snapshot;
}

export function subscribeHistoryPaging(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Replace fields of the snapshot; listeners run only on a real change. */
export function patchHistoryPaging(patch: Partial<HistoryPagingSnapshot>): void {
  let changed = false;
  for (const key of Object.keys(patch) as Array<keyof HistoryPagingSnapshot>) {
    if (patch[key] !== undefined && patch[key] !== snapshot[key]) { changed = true; break; }
  }
  if (!changed) return;
  snapshot = Object.freeze({ ...snapshot, ...patch });
  listeners.forEach((listener) => listener());
}

/** Start a fresh walk for `sessionId` (or clear it with null). */
export function resetHistoryPaging(sessionId: string | null, hasMore: boolean): void {
  snapshot = Object.freeze({ ...IDLE, sessionId, hasMore });
  listeners.forEach((listener) => listener());
}

export function registerOlderHistoryLoader(next: OlderHistoryLoader): void {
  loader = next;
}

let beforeOlderRows: (() => void) | null = null;

/** The mounted transcript registers how to hold its scroll position and
    mount window steady across a prepend; returns an unregister function. */
export function registerBeforeOlderRows(hook: () => void): () => void {
  beforeOlderRows = hook;
  return () => { if (beforeOlderRows === hook) beforeOlderRows = null; };
}

/** Run by the loader synchronously, right before older rows publish. */
export function runBeforeOlderRows(): void {
  beforeOlderRows?.();
}

/** True when scrolling to the top should ask for another page. */
export function canLoadOlderHistory(): boolean {
  return Boolean(loader && snapshot.sessionId && snapshot.hasMore && !snapshot.loading);
}

/** Load the next older page; resolves with the number of rows added. */
export function requestOlderHistory(request: OlderHistoryRequest = {}): Promise<number> {
  if (!loader || !snapshot.hasMore) return Promise.resolve(0);
  return loader(request);
}

/**
 * Load every remaining older page (find-in-session, export). Resolves with the
 * total rows added; stops early on failure or when the session changes.
 */
export async function requestAllOlderHistory(): Promise<number> {
  const sessionId = snapshot.sessionId;
  let added = 0;
  for (let guard = 0; guard < 1000 && loader && snapshot.hasMore && snapshot.sessionId === sessionId; guard++) {
    const rows = await loader({ limit: 200 });
    if (rows <= 0 && (snapshot.failed || snapshot.sessionId !== sessionId)) break;
    added += rows;
  }
  return added;
}
