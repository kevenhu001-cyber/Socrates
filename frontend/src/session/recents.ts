import type { SessionListDto } from '@socrates/contracts';
/* session/recents.ts — extracted from legacy entry.
 * Recents fetching + session deletion/restore/purge/archive helpers.
 * Zero-behavior-change lift. Render surfaces (renderRecents,
 * renderArchivedList) and app reset resolve via window.* at call time.
 */
import { resetDomains, sessionStore } from '../store/index.ts';
import { serverCache } from './serverCache.ts';
import { saveState, rememberDeletedSession, forgetDeletedSession } from './saveState.ts';
import {
  getVisibleSessions,
  getArchivedSessionsFrom,
  sweepExpiredArchivesFrom,
  setChatIdInURL,
  type SessionRow,
} from './store.ts';
import { createReconciler } from './recentsReconcile.ts';
import { readBootSessions } from './bootSessions.ts';
import {
  RECENTS_PAGE_SIZE,
  getSessionListPagingSnapshot,
  patchSessionListPaging,
  resetSessionListPaging,
} from './sessionListPagingState.ts';
import { getKnownTagsFromSessions } from '../legacy/recentsModel.ts';
import { apiFetch } from '../util/api/index.ts';
import { detailCache } from './detailCache.ts';
import { clearLocalMemory } from '../storage/localMemory.ts';
import { publishReactChatRuntime } from '../legacy/reactBridge.ts';
import { resetShareToken, toggleShareBtn } from '../legacy/share.ts';
import { showConfirm } from '../legacy/confirm.js';
import { showToast } from '../legacy/toast.js';
import { clearComposer } from '../composer/controller.ts';
import { clearComposerPlugins } from '../composer/pluginSelection.ts';
import { clearLegacyMsgListChildren } from '../legacy/messageListDom.ts';
import { turnState } from '../chat/turn/state.ts';
import { detachActiveTurn } from '../chat/turn/cancelActiveTurn.ts';
import { activateMainView } from '../legacy/mainViewController.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { getCurrentUser } from '../app/lifecycle/index.ts';
import { t } from '../i18n/index.ts';
import { renderRecents } from '../legacy/recentsView.ts';
import { renderArchivedList } from '../legacy/storage.ts';

/* RN-14: a deleted session's mistakes leave the cross-session book. */
function forgetSessionMistakes(id: string): void {
  void import('../tutor/mistakeArchive.ts')
    .then(({ forgetArchivedSession }) => forgetArchivedSession(id))
    .catch((error) => reportSwallow(error, 'session/recents.forgetSessionMistakes'));
}

/** Render/reset surfaces published by the legacy shell. */
interface RecentsWindow extends Window {
  renderRecents?: () => void;
  renderArchivedList?: () => void;
  saveCurrentSession?: () => unknown;
}

/** The status a rejected request carries, or undefined for a thrown value. */
function errorStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

function errorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : '';
}

function _t(key: string, fallback?: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const v = window.t(key);
      if (v && v !== key) return v;
    }
    const val = t(key);
    if (val && val !== key) return val;
  } catch (e) {
    reportSwallow(e, 'session/recents._t');
  }
  return fallback != null ? fallback : key;
}
function _renderRecents(): void {
  try {
    renderRecents();
  } catch (e) {
    reportSwallow(e, 'session/recents._renderRecents');
  }
}
function _renderArchivedList(): void {
  try {
    const win = window as RecentsWindow;
    if (typeof win.renderArchivedList === 'function') {
      win.renderArchivedList();
    } else {
      renderArchivedList();
    }
  } catch (e) {
    reportSwallow(e, 'session/recents._renderArchivedList');
  }
}
function _saveCurrentSession(): unknown {
  try {
    const win = window as RecentsWindow;
    if (typeof win.saveCurrentSession === 'function') return win.saveCurrentSession();
  } catch (e) {
    reportSwallow(e, 'session/recents.saveCurrentSession');
  }
  return null;
}
function _currentUser(): { id?: string; tier?: string } | null {
  return (getCurrentUser() as { id?: string; tier?: string } | null) || null;
}

/* The cache holds the visible pages, pinned chats and archives. A response
 * for one page must never replace data from other pages. */
function mergeSessionPages(...pages: ReadonlyArray<ReadonlyArray<SessionRow>>): SessionRow[] {
  const seen = new Map<string, SessionRow>();
  for (const page of pages)
    for (const row of page)
      if (row?.id && !seen.has(row.id)) seen.set(row.id, row);
  return Array.from(seen.values());
}

let listUserId: string | null = null;
let pinnedReady = false;
let archivedReady = false;
let archivedRequest: Promise<void> | null = null;
let olderRequest: Promise<void> | null = null;

async function fetchPinnedSessions(): Promise<SessionRow[]> {
  if (pinnedReady) return [];
  const rows: SessionRow[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const query = new URLSearchParams({
      limit: '200', pinnedOnly: 'true', cursorVersion: '2',
    });
    if (cursor) query.set('cursor', cursor);
    const page = await apiFetch<SessionListDto>('/api/sessions?' + query);
    if (!Array.isArray(page?.sessions)) throw new Error('Invalid pinned sessions response');
    rows.push(...page.sessions);
    cursor = typeof page.nextCursor === 'string' ? page.nextCursor : null;
    if (cursor && seen.has(cursor)) throw new Error('Pinned sessions cursor did not advance');
    if (cursor) seen.add(cursor);
  } while (cursor);
  pinnedReady = true;
  return rows;
}

/** Fetch older metadata only when a user scrolls near the end of the sidebar. */
export async function loadMoreServerSessions(): Promise<void> {
  const state = getSessionListPagingSnapshot();
  if (!state.initialized || !state.nextCursor || state.loading || olderRequest) return;
  const cursor = state.nextCursor;
  const owner = listUserId;
  patchSessionListPaging({ loading: true, failed: false });
  const run = async () => {
    try {
      const query = new URLSearchParams({
        limit: String(RECENTS_PAGE_SIZE), cursorVersion: '2', cursor,
      });
      const page = await apiFetch<SessionListDto>('/api/sessions?' + query);
      if (!Array.isArray(page?.sessions)) throw new Error('Invalid session page');
      if (listUserId !== owner || getSessionListPagingSnapshot().nextCursor !== cursor) return;
      serverCache.sessions = mergeSessionPages(serverCache.sessions, page.sessions);
      patchSessionListPaging({
        nextCursor: typeof page.nextCursor === 'string' && page.nextCursor !== cursor
          ? page.nextCursor : null,
        loading: false,
        failed: false,
        loadedPages: state.loadedPages + 1,
      });
      _renderRecents();
    } catch (error) {
      if (listUserId !== owner) return;
      patchSessionListPaging({ loading: false, failed: true });
      reportSwallow(error, 'session/recents.loadMoreServerSessions', 'expected');
    }
  };
  olderRequest = run().finally(() => { olderRequest = null; });
  return olderRequest;
}

/** Archives are cold data; the Storage dialog fetches them only when opened. */
export function ensureArchivedSessions(): Promise<void> {
  if (archivedReady) return Promise.resolve();
  if (archivedRequest) return archivedRequest;
  const owner = listUserId;
  archivedRequest = (async () => {
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const query = new URLSearchParams({
        limit: '100', archivedOnly: 'true', cursorVersion: '2',
      });
      if (cursor) query.set('cursor', cursor);
      const page = await apiFetch<SessionListDto>('/api/sessions?' + query);
      if (!Array.isArray(page?.sessions)) throw new Error('Invalid archived sessions response');
      if (owner !== listUserId) return;
      serverCache.sessions = mergeSessionPages(
        page.sessions.filter((row) => Boolean(row.archivedAt)),
        serverCache.sessions,
      );
      _renderArchivedList();
      cursor = typeof page.nextCursor === 'string' ? page.nextCursor : null;
      if (cursor && seen.has(cursor)) throw new Error('Archived sessions cursor did not advance');
      if (cursor) seen.add(cursor);
    } while (cursor);
    archivedReady = true;
  })()
    .catch((error) => reportSwallow(error, 'session/recents.ensureArchivedSessions', 'expected'))
    .finally(() => { archivedRequest = null; });
  return archivedRequest;
}


export function getRecents(): SessionRow[] {
  /* P2.3 — sweep local expired archives first so the Recents
     list and the Storage modal never disagree. */
  sweepExpiredArchives();
  /* P2.3 — archived sessions are hidden from the default
     Recents list. Users restore them from the Storage modal. */
  return getVisibleSessions(serverCache.sessions);
}

export function getKnownTags(): string[] {
  return getKnownTagsFromSessions(serverCache.sessions) as string[];
}

export async function refreshServerSessions(): Promise<SessionRow[]> {
  const user = _currentUser();
  if (!user) {
    listUserId = null;
    serverCache.sessions = [];
    resetSessionListPaging();
    return [];
  }
  const owner = user.id || null;
  if (listUserId !== owner) {
    listUserId = owner;
    serverCache.sessions = [];
    pinnedReady = false;
    archivedReady = false;
    resetSessionListPaging();
  }

  // The first-page preflight runs in the HTML head. Fetch pinned chats
  // independently to keep older pinned conversations visible on page one.
  const pinnedPromise = fetchPinnedSessions()
    .catch((error): SessionRow[] => {
      reportSwallow(error, 'session/recents.pinned', 'expected');
      return [];
    });
  let page: SessionListDto | null = await readBootSessions(window);
  let ok = Boolean(page);
  if (!page) {
    const path = '/api/sessions?limit=' + RECENTS_PAGE_SIZE + '&cursorVersion=2';
    try {
      page = await apiFetch<SessionListDto>(path);
      if (!Array.isArray(page?.sessions)) throw new Error('Invalid recents response');
      ok = true;
    } catch (error) {
      const status = errorStatus(error);
      const retryable =
        status === undefined || status === 0 || status === 408 || status === 429 ||
        (status >= 500 && status < 600);
      if (retryable) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 400));
          page = await apiFetch<SessionListDto>(path);
          if (!Array.isArray(page?.sessions)) throw new Error('Invalid recents response', { cause: error });
          ok = true;
        } catch (retryError) {
          reportSwallow(retryError, 'session/recents.fetch.retry');
        }
      }
    }
  }

  const pinned = await pinnedPromise;
  if (owner !== listUserId) return serverCache.sessions.slice();
  if (ok && page) {
    const previous = getSessionListPagingSnapshot();
    serverCache.sessions = mergeSessionPages(page.sessions, pinned, serverCache.sessions);
    patchSessionListPaging({
      nextCursor: previous.loadedPages > 1
        ? previous.nextCursor
        : (typeof page.nextCursor === 'string' ? page.nextCursor : null),
      initialized: true,
      failed: false,
      loadedPages: Math.max(1, previous.loadedPages),
    });
  } else if (pinned.length) {
    serverCache.sessions = mergeSessionPages(pinned, serverCache.sessions);
  }
  serverCache.fetchFailed = !ok;
  return serverCache.sessions.slice();
}
/* The reconciler refreshes the first page only, preserving older pages.
   It still coalesces saves instead of fetching on every turn. saveCurrentSession() used to await this fetch on EVERY
   successful save, which both amplified the background load and stretched
   `saveInFlight` — and loadSession() drained `saveInFlight`, so the drain
   became the session switch's critical path. Saves now patch their own row
   locally (see persistence.ts) and ask for a throttled reconcile here. */
const _reconciler = createReconciler({
  refresh: refreshServerSessions,
  onDone: function () {
    try {
      _renderRecents();
    } catch (e) {
      reportSwallow(e, 'session/recents.reconciler.onDone');
    } /* best effort */
  },
});

/* Fold a request into the next reconcile window. Cheap to call repeatedly. */
export function scheduleRecentsReconcile(): void {
  try {
    _reconciler.schedule();
  } catch (e) {
    reportSwallow(e, 'session/recents.scheduleReconcile');
  }
}

/* Re-fetch now and drop any pending window. Only for flows that cannot show
   stale rows: delete, archive, restore, purge, sign-in, manual retry. */
export function flushRecentsReconcile(): Promise<unknown> {
  try {
    return _reconciler.flush();
  } catch (e) {
    reportSwallow(e, 'session/recents.flushReconcile');
    return Promise.resolve();
  }
}

/* manual retry entry point bound from the
   "Couldn't load sessions — Retry" empty state. Re-runs the fetch,
   then re-renders so the user sees the result immediately. */
export async function retryRecentsFetch(): Promise<void> {
  try {
    showToast(_t('toast.loadingSessions'));
  } catch (e) {
    reportSwallow(e, 'session/recents.fetch.loadingToast');
  }
  try {
    await flushRecentsReconcile();
  } catch (e) {
    reportSwallow(e, 'session/recents.fetch.flushReconcile');
  }
  try {
    _renderRecents();
  } catch (e) {
    reportSwallow(e, 'session/recents.fetch.renderRecents');
  }
}
export function findServerSessionIndex(id: string): number {
  for (let i = 0; i < serverCache.sessions.length; i++) {
    if (serverCache.sessions[i].id === id) return i;
  }
  return -1;
}

export async function actuallyDeleteSession(id: string, ev?: Event | null): Promise<void> {
  if (!_currentUser()) return;
  /* the trash button lives inside
     `.recent-item` which has onclick="loadSession(...)". Without
     stopping propagation here, clicking delete would ALSO trigger
     loadSession(deletedId): stateStore.read("currentSessionId") would flip to the
     about-to-be-deleted id, the chat panel would re-render its
     messages, and the user would see "the deleted session's records"
     (verbatim bug report) until the async GET returned 404 and the
     cleanup branch fired. */
  if (ev && ev.stopPropagation) ev.stopPropagation();
  if (ev && ev.preventDefault) ev.preventDefault();
  /* await any in-flight save before sending
     the DELETE. Without this, a concurrent _saveCurrentSession()
     POST could land on the server AFTER the DELETE has committed,
     and the upsert would silently re-insert the deleted row —
     the session "comes back to life". Drain the pipeline first
     (including the saveState.saveDirty cascade), then register the tombstone
     so no subsequent save can race with the delete. */
  if (saveState.saveInFlight) {
    try {
      await saveState.saveInFlight;
    } catch (e) {
      reportSwallow(e, 'session/recents.deleteSession.drainInFlight');
    }
  }
  exitSessionIfCurrent(id, 'session-deleted');
  /* Drop the session from the local cache immediately so the UI
     updates without waiting for the round-trip. If the server
     call fails, the catch handler re-fetches and re-renders. */
  serverCache.sessions = serverCache.sessions.filter(function (s) {
    return s.id !== id;
  });
  clearLocalMemory(id);
  forgetSessionMistakes(id);
  /* P2 SWR — a deleted/archived session must not survive in the detail cache. */
  detailCache.invalidate(id);
  _renderRecents();
  /* register this id with the doSave() tombstone
     set BEFORE the network round-trip. Any POST that arrives during the
     request, or a later save cascade, sees the tombstone and cannot
     re-insert the deleted session. */
  rememberDeletedSession(id);
  /* Single-step: server's DELETE /api/sessions/:id now deletes
     directly without requiring archive first. */
  apiFetch('/api/sessions/' + encodeURIComponent(id), {
    method: 'DELETE',
  })
    .then(function () {
      showToast(_t('session.deleted'));
      flushRecentsReconcile().then(function () {
        /* the server has now confirmed the
         row is gone. From this point on, a streaming-callback
         POST that happens to carry this same id is no longer
         a "resurrection" risk (the row is genuinely deleted),
         and the very next _saveCurrentSession() that creates a
         NEW session with a coincidentally-equivalent id would
         be falsely blocked. Lift the tombstone. */
        forgetDeletedSession(id);
        exitSessionIfCurrent(id, 'session-deleted');
      });
    })
    .catch(function (err) {
      /* delete sync failed */
      try {
        showToast(
          _t('session.deleteFailedRefresh').replace('{msg}', errorMessage(err) || 'server error'),
          4000,
        );
      } catch (e) {
        reportSwallow(e, 'session/recents.deleteSession.toast');
      }
      /* keep the tombstone on failure. The
       local mirror no longer has the row (we filtered it at
       t≈0) and the server claim is "404 / error", so any
       pending POST is at best a useless retry and at worst a
       resurrection. Lift it only after a refresh confirms the
       server really is consistent. */
      flushRecentsReconcile().then(function () {
        const idx = findServerSessionIndex(id);
        if (idx < 0) forgetDeletedSession(id);
      });
    });
}

function stageSessionArchive(id: string, stamp: number): void {
  detailCache.invalidate(id);
  const idx = findServerSessionIndex(id);
  if (idx >= 0) {
    serverCache.sessions[idx].archivedAt = stamp;
  } else {
    serverCache.sessions.push({ id: id, archivedAt: stamp, updatedAt: stamp, createdAt: stamp });
  }
  _renderRecents();
  _renderArchivedList();
}

async function finishSessionArchive(id: string): Promise<void> {
  showToast(_t('session.archived'));
  await flushRecentsReconcile();
  _renderRecents();
  _renderArchivedList();
  exitSessionIfCurrent(id, 'archived-session');
}

async function rollbackSessionArchive(id: string, error: unknown): Promise<void> {
  const back = findServerSessionIndex(id);
  if (back >= 0) serverCache.sessions[back].archivedAt = null;
  try {
    showToast(
      _t('session.archiveFailed').replace('{msg}', errorMessage(error) || 'server error'),
      4000,
    );
  } catch (e) {
    reportSwallow(e, 'session/recents.archiveSession.toast');
  }
  try {
    await flushRecentsReconcile();
  } catch (e) {
    reportSwallow(e, 'session/recents.archiveSession.flushReconcile');
  }
  _renderRecents();
  _renderArchivedList();
}

export async function archiveSession(id: string, ev?: Event | null): Promise<void> {
  if (!_currentUser()) return;
  if (ev && ev.stopPropagation) ev.stopPropagation();
  if (ev && ev.preventDefault) ev.preventDefault();
  if (saveState.saveInFlight) {
    try {
      await saveState.saveInFlight;
    } catch (e) {
      reportSwallow(e, 'session/recents.archiveSession.drainInFlight');
    }
  }
  exitSessionIfCurrent(id, 'archived-session');
  const stamp = Date.now();
  stageSessionArchive(id, stamp);
  try {
    await apiFetch('/api/sessions/' + encodeURIComponent(id) + '/archive', {
      method: 'POST',
    });
    await finishSessionArchive(id);
  } catch (error) {
    /* Roll the optimistic stamp so a failed POST doesn't hide the row. */
    await rollbackSessionArchive(id, error);
  }
}

/* P2.3 — record the archive timestamp locally. The local copy
   is the source of truth for the UI (filtered out of
   Recents, surfaced in the Storage modal). The server mirrors
   it via the DELETE /api/sessions/<id>/archive call below. */
export function restoreSession(id: string): void {
  if (!_currentUser()) return;
  const idx = findServerSessionIndex(id);
  if (idx < 0) return;
  serverCache.sessions[idx].archivedAt = null;
  apiFetch('/api/sessions/' + encodeURIComponent(id) + '/archive', {
    method: 'DELETE',
  }).catch(function (e) {
    /* archive sync failed */
    reportSwallow(e, 'session/recents.restoreSession.archiveSync');
  });
  _renderRecents();
  _renderArchivedList();
}
/* P2.3 — permanent erase. Two-step: only available from the
   Storage modal (not the long-press delete), and requires
   typing the session title. Mirrors the backend's "must be
   archived first" constraint documented in
   docs/api/openapi.yaml P2.3 (409 on active session). */
export function confirmPurgeSession(id: string): void {
  const idx = findServerSessionIndex(id);
  if (idx < 0) return;
  const s = serverCache.sessions[idx];
  if (!s.archivedAt) {
    showToast(_t('session.archiveFirst'));
    return;
  }
  showConfirm(
    _t('confirm.deleteForever.title'),
    _t('confirm.deleteForever.msg').replace('{title}', s.title || s.topic || 'this session'),
    true,
  ).then(function (yes: boolean) {
    if (!yes) return;
    apiFetch('/api/sessions/' + encodeURIComponent(id), {
      method: 'DELETE',
    })
      .then(function () {
        exitSessionIfCurrent(id, 'session-purged');
        serverCache.sessions = serverCache.sessions.filter(function (r) {
          return r.id !== id;
        });
        clearLocalMemory(id);
        forgetSessionMistakes(id);
        _renderArchivedList();
        _renderRecents();
        showToast(_t('session.deleted'));
      })
      .catch(function (err) {
        showToast(
          _t('session.deleteFailedMsg').replace('{msg}', errorMessage(err) || 'server error'),
        );
      });
  });
}

/* P2.3 — return a list of archived sessions, sorted newest
   first, with entries older than 30 days filtered out (the
   server is expected to GC them too, but we mirror the
   policy client-side so the Storage modal doesn't show
   ghost rows). */
export function getArchivedSessions(): SessionRow[] {
  return getArchivedSessionsFrom(serverCache.sessions);
}
/* P2.3 — the localStorage mirror is swept the same way the
   server is expected to. Called from refreshServerSessions
   and on every read of getArchivedSessions. */
export function sweepExpiredArchives(): boolean {
  const result = sweepExpiredArchivesFrom(serverCache.sessions);
  serverCache.sessions = result.sessions;
  return result.changed;
}

/** Leave only the session being removed, even after an async response. */
function exitSessionIfCurrent(
  id: string,
  reason: 'archived-session' | 'session-deleted' | 'session-purged',
): void {
  if (sessionStore.getState().currentSessionId !== id) return;
  resetShareToken();
  detachActiveTurn(reason);
  turnState.pendingChatContent = null;
  turnState.pendingAttachments = null;
  resetDomains();
  toggleShareBtn();
  setChatIdInURL(null);
  activateMainView('topicSetup', document);
  clearLegacyMsgListChildren();
  publishReactChatRuntime({ type: 'state-synced', reason: 'removed-session-reset' });
  clearComposer('topic');
  clearComposerPlugins('topic');
  clearComposerPlugins('chat');
}

/* ─── Session context menu (long-press / right-click) ───
   Delete, pin/unpin, and custom label via a floating popover.
   Uses touch timer for mobile, contextmenu for desktop. */

/* When non-null, the context menu is open for this session id.
   While set, click events on the corresponding .recent-item are
   blocked via pointer-events:none on the row element, preventing
   the synthetic click from navigating. */
/* B2: _ctxMenuSessionId centralized as serverCache.ctxMenuSessionId. */
