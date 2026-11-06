/* session/historyPaging.ts — R7 phase 2: open a long conversation from its
 * newest page and read older pages on demand.
 *
 * GET /api/sessions/:id?tail=N returns the newest N messages plus
 * `messagesPage: { hasMore, cursor, total }`; GET /:id/messages walks older
 * pages from that cursor. A server (or mock) that ignores `tail` answers with
 * the whole transcript and no `messagesPage`, which reads as a single,
 * complete page, so old servers keep working unchanged.
 *
 * Pagination is a transport/render concern only: the save path is a pure
 * upsert by contract (saveDelta.ts), so a transcript holding only its newest
 * rows never deletes older ones, and older pages are added to the save
 * watermark as they arrive so they are not re-uploaded.
 */
import { apiFetch } from '../util/api.ts';
import { stateStore } from '../state/store.ts';
import { dispatchSession } from '../store/index.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { restoreSessionMessage, type PersistedMessage } from './historyRestore.ts';
import { markMessagesSynced } from './persistence.ts';
import {
  getHistoryPagingSnapshot,
  patchHistoryPaging,
  registerOlderHistoryLoader,
  resetHistoryPaging,
  runBeforeOlderRows,
  validCursor,
  type HistoryCursor,
  type MessagesPage,
  type OlderHistoryRequest,
} from './historyPagingState.ts';
import type { ChatMessageShape } from '../state/session.ts';

export const OLDER_PAGE_SIZE = 100;

interface PagedDetail {
  messagesPage?: MessagesPage | null;
  [key: string]: unknown;
}

interface PageResponse {
  messages?: PersistedMessage[];
  hasMore?: boolean;
  cursor?: HistoryCursor | null;
}

let cursor: HistoryCursor | null = null;
let generation = 0;
let inflight: Promise<number> | null = null;

/** Called by the loader once the tail page is in the store. */
export function beginHistoryPaging(sessionId: string, response: PagedDetail | null | undefined): void {
  generation += 1;
  inflight = null;
  const page = response && response.messagesPage;
  cursor = page && page.hasMore && validCursor(page.cursor) ? page.cursor : null;
  resetHistoryPaging(sessionId, cursor !== null);
}

/** Leave paging (exam view, missing session, new chat). */
export function endHistoryPaging(): void {
  generation += 1;
  inflight = null;
  cursor = null;
  resetHistoryPaging(null, false);
}

function pagePath(sessionId: string, from: HistoryCursor, limit: number): string {
  return '/api/sessions/' + encodeURIComponent(sessionId) + '/messages?limit=' + limit
    + '&before=' + encodeURIComponent(from.createdAt)
    + '&beforeId=' + encodeURIComponent(from.id);
}

function knownIds(messages: ReadonlyArray<ChatMessageShape>): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    const row = message as { clientId?: unknown; serverId?: unknown; id?: unknown };
    for (const value of [row.clientId, row.serverId, row.id]) {
      if (typeof value === 'string' && value) ids.add(value);
    }
  }
  return ids;
}

function freshRows(rows: PersistedMessage[], current: ReadonlyArray<ChatMessageShape>): PersistedMessage[] {
  const ids = knownIds(current);
  return rows.filter((row) => !(
    (typeof row.id === 'string' && ids.has(row.id))
    || (typeof row.clientId === 'string' && ids.has(row.clientId))
  ));
}

function applyOlderRows(sessionId: string, rows: PersistedMessage[], request: OlderHistoryRequest): number {
  const current = stateStore.read('messages') as ChatMessageShape[];
  const restored = freshRows(rows, current).map(restoreSessionMessage);
  if (!restored.length) return 0;
  try {
    runBeforeOlderRows();
    request.beforeApply?.();
  } catch (error) { reportSwallow(error, 'session/historyPaging.beforeApply'); }
  dispatchSession({
    type: 'session/replace-messages',
    payload: (restored as unknown as ChatMessageShape[]).concat(current),
  });
  markMessagesSynced(sessionId, restored);
  return restored.length;
}

function loadOlderPage(request: OlderHistoryRequest): Promise<number> {
  if (inflight) return inflight;
  const state = getHistoryPagingSnapshot();
  const sessionId = state.sessionId;
  const from = cursor;
  if (!sessionId || !from || !state.hasMore) return Promise.resolve(0);
  const token = generation;
  const limit = Math.min(Math.max(Math.floor(request.limit || OLDER_PAGE_SIZE), 1), 200);
  const stillCurrent = () => token === generation && stateStore.read('currentSessionId') === sessionId;
  patchHistoryPaging({ loading: true, failed: false });
  const run = apiFetch<PageResponse>(pagePath(sessionId, from, limit)).then((page) => {
    if (!stillCurrent()) return 0;
    const rows = page && Array.isArray(page.messages) ? page.messages : [];
    const more = Boolean(page && page.hasMore === true && validCursor(page.cursor));
    cursor = more ? page.cursor as HistoryCursor : null;
    /* Publish the paging state and the rows in one runtime notification so
       the list renders the prepended rows and the final status together. */
    patchHistoryPaging({ hasMore: more, loading: false, pagedBack: true });
    const added = applyOlderRows(sessionId, rows, request);
    publishReactChatRuntime({ type: 'state-synced', reason: 'history-page' });
    return added;
  }).catch((error: unknown) => {
    if (stillCurrent()) patchHistoryPaging({ loading: false, failed: true });
    reportSwallow(error, 'session/historyPaging.loadOlderPage', 'expected');
    return 0;
  }).finally(() => {
    if (token === generation) inflight = null;
  });
  inflight = run;
  return run;
}

registerOlderHistoryLoader(loadOlderPage);
