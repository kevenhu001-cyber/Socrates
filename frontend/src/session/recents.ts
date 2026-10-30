/* session/recents.ts — extracted from main.js (B2/B6 batch).
 * Recents fetching + session deletion/restore/purge/archive helpers.
 * Zero-behavior-change lift. Render surfaces (renderRecents,
 * renderArchivedList) and app reset resolve via window.* at call time.
 */
import { stateStore, resetState } from '../state/store.ts';
import { serverCache } from './serverCache.ts';
import { saveState, rememberDeletedSession, forgetDeletedSession } from './saveState.ts';
import { getVisibleSessions, getArchivedSessionsFrom, sweepExpiredArchivesFrom, setChatIdInURL, type SessionRow } from './store.ts';
import { createReconciler } from './recentsReconcile.ts';
import { getKnownTagsFromSessions } from '../ui/recentsHelpers.ts';
import { apiFetch } from '../util/api.ts';
import { detailCache } from './detailCache.ts';
import { clearLocalMemory } from '../storage/localMemory.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.ts';
import { resetShareToken, toggleShareBtn } from '../ui/share.ts';
import { showConfirm } from '../ui/confirm.js';
import { showToast } from '../ui/toast.js';
import { clearComposer } from '../composer/controller.ts';
import { clearComposerPlugins } from '../composer/pluginSelection.ts';
import { clearLegacyMsgListChildren } from '../ui/messageListDom.ts';
import { updateComposerBtn } from '../ui/topicSetup.ts';
import { turnState } from '../chat/turnState.ts';
import { activateMainView } from '../ui/mainViewController.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

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
  } catch (e) { reportSwallow(e, 'session/recents._t'); }
  return fallback != null ? fallback : key;
}
function _renderRecents(): void {
  try {
    const win = window as RecentsWindow;
    if (typeof win.renderRecents === 'function') win.renderRecents();
  } catch (e) { reportSwallow(e, 'session/recents._renderRecents'); }
}
function _renderArchivedList(): void {
  try {
    const win = window as RecentsWindow;
    if (typeof win.renderArchivedList === 'function') win.renderArchivedList();
  } catch (e) { reportSwallow(e, 'session/recents._renderArchivedList'); }
}
function _saveCurrentSession(): unknown {
  try {
    const win = window as RecentsWindow;
    if (typeof win.saveCurrentSession === 'function') return win.saveCurrentSession();
  } catch (e) { reportSwallow(e, 'session/recents.saveCurrentSession'); }
  return null;
}
function _currentUser(): { tier?: string } | null {
  try {
    if (typeof window !== 'undefined') return window.CURRENT_USER || null;
  } catch (e) { reportSwallow(e, 'session/recents.currentUser'); }
  return null;
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
  if (!_currentUser()) return [];
  /* P_delbug-cleanup — the previous `console.warn("[DEL-BUG] ...")`
     tracing logs (incl. a `new Error().stack` capture on every call)
     were left over from a delete-flow debugging session and flooded
     the console on every login / save / delete. Demoted to
     console.debug so they stay available under Verbose level without
     polluting the default console. */
  let ok = false;
  /* Include archived rows so the Storage modal can list them without a
     second fetch. getRecents()/getVisibleSessions still hide archivedAt. */
  try {
    const r = await apiFetch<{ sessions?: SessionRow[] }>('/api/sessions?limit=200&archived=true');
    serverCache.sessions = r && Array.isArray(r.sessions) ? r.sessions : [];
    ok = true;
  } catch (e) {
    /* P_recents-fetch-fail — retry ONCE on transient failures (network
       blip, 5xx, 429). This covers the "some devices" report where a
       flaky connection or a momentary 502/503 left the user with an
       empty Recents list. Non-retryable errors (401/403/404) skip the
       retry so we don't waste a roundtrip on a definitely-broken
       request. The original bug silently swallowed ALL errors here,
       leaving serverCache.sessions=[] and showing "No recent sessions yet."
       even when the user had sessions on the server. */
    const status = errorStatus(e);
    const retryable = status === 0 || status === 408 || status === 429 ||
                    (typeof status === 'number' && status >= 500 && status < 600);
    if (retryable) {
      try {
        await new Promise(function (res) { setTimeout(res, 400); });
        const r2 = await apiFetch<{ sessions?: SessionRow[] }>('/api/sessions?limit=200&archived=true');
        serverCache.sessions = r2 && Array.isArray(r2.sessions) ? r2.sessions : [];
        ok = true;
      } catch (retryError) {
        /* still failing — surface below */
        reportSwallow(retryError, 'session/recents.fetch.retry');
      }
    }
  }
  serverCache.fetchFailed = !ok;
  return serverCache.sessions.slice();
}
/* P_recents-amplify — the one place that owns "when is it worth re-fetching
   all 200 rows". saveCurrentSession() used to await this fetch on EVERY
   successful save, which both amplified the background load and stretched
   `saveInFlight` — and loadSession() drained `saveInFlight`, so the drain
   became the session switch's critical path. Saves now patch their own row
   locally (see persistence.ts) and ask for a throttled reconcile here. */
const _reconciler = createReconciler({
  refresh: refreshServerSessions,
  onDone: function () {
    try { _renderRecents(); }
    catch (e) { reportSwallow(e, 'session/recents.reconciler.onDone'); } /* best effort */
  },
});

/* Fold a request into the next reconcile window. Cheap to call repeatedly. */
export function scheduleRecentsReconcile(): void {
  try { _reconciler.schedule(); }
  catch (e) { reportSwallow(e, 'session/recents.scheduleReconcile'); }
}

/* Re-fetch now and drop any pending window. Only for flows that cannot show
   stale rows: delete, archive, restore, purge, sign-in, manual retry. */
export function flushRecentsReconcile(): Promise<unknown> {
  try { return _reconciler.flush(); }
  catch (e) { reportSwallow(e, 'session/recents.flushReconcile'); return Promise.resolve(); }
}

/* P_recents-fetch-fail — manual retry entry point bound from the
   "Couldn't load sessions — Retry" empty state. Re-runs the fetch,
   then re-renders so the user sees the result immediately. */
export async function retryRecentsFetch(): Promise<void> {
  try { showToast(_t('toast.loadingSessions')); } catch (e) { reportSwallow(e, 'session/recents.fetch.loadingToast'); }
  try { await flushRecentsReconcile(); } catch (e) { reportSwallow(e, 'session/recents.fetch.flushReconcile'); }
  try { _renderRecents(); } catch (e) { reportSwallow(e, 'session/recents.fetch.renderRecents'); }
}
export function findServerSessionIndex(id: string): number {
  for (let i = 0; i < serverCache.sessions.length; i++) {
    if (serverCache.sessions[i].id === id) return i;
  }
  return -1;
}

export async function actuallyDeleteSession(id: string, ev?: Event | null): Promise<void> {
  if (!_currentUser()) return;
  /* P_delete-stale-click — the trash button lives inside
     `.recent-item` which has onclick="loadSession(...)". Without
     stopping propagation here, clicking delete would ALSO trigger
     loadSession(deletedId): stateStore.read("currentSessionId") would flip to the
     about-to-be-deleted id, the chat panel would re-render its
     messages, and the user would see "the deleted session's records"
     (verbatim bug report) until the async GET returned 404 and the
     cleanup branch fired. */
  if (ev && ev.stopPropagation) ev.stopPropagation();
  if (ev && ev.preventDefault) ev.preventDefault();
  /* P_serialize-delete — await any in-flight save before sending
     the DELETE. Without this, a concurrent _saveCurrentSession()
     POST could land on the server AFTER the DELETE has committed,
     and the upsert would silently re-insert the deleted row —
     the session "comes back to life". Drain the pipeline first
     (including the saveState.saveDirty cascade), then register the tombstone
     so no subsequent save can race with the delete. */
  if (saveState.saveInFlight) {
    try { await saveState.saveInFlight; } catch (e) { reportSwallow(e, 'session/recents.deleteSession.drainInFlight'); }
  }
  /* If the deleted session is active, leave its view and cancel any
     in-flight stream so a partial reply cannot reappear after deletion. */
  const wasActive = stateStore.read('currentSessionId') === id;
  if (wasActive) {
    if (turnState.activeChatCtl) { try { turnState.activeChatCtl.abort(); } catch (e) { reportSwallow(e, 'session/recents.deleteSession.abortTurn'); } }
    const abortActive = turnState.activeChatAbort;
    if (abortActive) { try { abortActive('session-deleted'); } catch (e) { reportSwallow(e, 'session/recents.deleteSession.abortActive'); } }
    bounceOutOfArchivedSession();
  }
  /* Drop the session from the local cache immediately so the UI
     updates without waiting for the round-trip. If the server
     call fails, the catch handler re-fetches and re-renders. */
  serverCache.sessions = serverCache.sessions.filter(function (s) { return s.id !== id; });
  clearLocalMemory(id);
  /* P2 SWR — a deleted/archived session must not survive in the detail cache. */
  detailCache.invalidate(id);
  _renderRecents();
  /* P_delete-resurrect — register this id with the doSave() tombstone
     set BEFORE the network round-trip. Any POST that arrives during the
     request, or a later save cascade, sees the tombstone and cannot
     re-insert the deleted session. */
  rememberDeletedSession(id);
  /* Single-step: server's DELETE /api/sessions/:id now deletes
     directly without requiring archive first. */
  apiFetch('/api/sessions/' + encodeURIComponent(id), {
    method: 'DELETE',
  }).then(function () {
    showToast(_t('session.deleted'));
    /* P_delete-stale — if no sessions remain, make sure the
       chat view is hidden and the topic-setup is showing so the
       user lands on a clean "start a new conversation" surface
       instead of a blank / stale chat panel. */
    flushRecentsReconcile().then(function () {
      /* P_delete-resurrect — the server has now confirmed the
         row is gone. From this point on, a streaming-callback
         POST that happens to carry this same id is no longer
         a "resurrection" risk (the row is genuinely deleted),
         and the very next _saveCurrentSession() that creates a
         NEW session with a coincidentally-equivalent id would
         be falsely blocked. Lift the tombstone. */
      forgetDeletedSession(id);
      const remaining = getRecents().length;
      if (remaining === 0) {
        bounceOutOfArchivedSession();
      } else if (wasActive) {
        _renderRecents();
      }
    });
  }).catch(function (err) {
    /* delete sync failed */
    try { showToast(_t('session.deleteFailedRefresh').replace('{msg}', errorMessage(err) || 'server error'), 4000); } catch (e) { reportSwallow(e, 'session/recents.deleteSession.toast'); }
    /* P_delete-resurrect — keep the tombstone on failure. The
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

/* Quick archive from the Recents row menu. Soft-hide only: the row leaves
   Recents immediately, lands in Storage (Profile → Archived), and can be
   restored for 30 days. Distinct from deleteSession, which hard-deletes. */
function stopActiveSessionForArchive(id: string): boolean {
  const wasActive = stateStore.read('currentSessionId') === id;
  if (!wasActive) return false;
  if (turnState.activeChatCtl) {
    try { turnState.activeChatCtl.abort(); } catch (e) { reportSwallow(e, 'session/recents.archiveSession.abortTurn'); }
  }
  const abortActive = turnState.activeChatAbort;
  if (abortActive) {
    try { abortActive('session-archived'); } catch (e) { reportSwallow(e, 'session/recents.archiveSession.abortActive'); }
  }
  bounceOutOfArchivedSession();
  return true;
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

async function finishSessionArchive(wasActive: boolean): Promise<void> {
  showToast(_t('session.archived'));
  await flushRecentsReconcile();
  _renderRecents();
  _renderArchivedList();
  if (wasActive || getRecents().length === 0) bounceOutOfArchivedSession();
}

async function rollbackSessionArchive(id: string, error: unknown): Promise<void> {
  const back = findServerSessionIndex(id);
  if (back >= 0) serverCache.sessions[back].archivedAt = null;
  try {
    showToast(_t('session.archiveFailed').replace('{msg}', errorMessage(error) || 'server error'), 4000);
  } catch (e) { reportSwallow(e, 'session/recents.archiveSession.toast'); }
  try { await flushRecentsReconcile(); } catch (e) { reportSwallow(e, 'session/recents.archiveSession.flushReconcile'); }
  _renderRecents();
  _renderArchivedList();
}

export async function archiveSession(id: string, ev?: Event | null): Promise<void> {
  if (!_currentUser()) return;
  if (ev && ev.stopPropagation) ev.stopPropagation();
  if (ev && ev.preventDefault) ev.preventDefault();
  if (saveState.saveInFlight) {
    try { await saveState.saveInFlight; } catch (e) { reportSwallow(e, 'session/recents.archiveSession.drainInFlight'); }
  }
  const wasActive = stopActiveSessionForArchive(id);
  const stamp = Date.now();
  stageSessionArchive(id, stamp);
  try {
    await apiFetch('/api/sessions/' + encodeURIComponent(id) + '/archive', {
      method: 'POST',
    });
    await finishSessionArchive(wasActive);
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
    }).then(function () {
      /* P_purge-bounce — if the purged session is the active one,
         bounce out to the topic-setup screen so stale content isn't
         shown. without this, the chat view continues displaying the
         deleted session's messages, topic badge, and knowledge
         graph until the user manually navigates away. */
      const wasActive = stateStore.read('currentSessionId') === id;
      if (wasActive) {
        if (turnState.activeChatCtl) { try { turnState.activeChatCtl.abort(); } catch (e) { reportSwallow(e, 'session/recents.purge.abortTurn'); } }
        const abortActive = turnState.activeChatAbort;
        if (abortActive) { try { abortActive('session-purged'); } catch (e) { reportSwallow(e, 'session/recents.purge.abortActive'); } }
        bounceOutOfArchivedSession();
      }
      serverCache.sessions = serverCache.sessions.filter(function (r) { return r.id !== id; });
      clearLocalMemory(id);
      _renderArchivedList();
      _renderRecents();
      showToast(_t('session.deleted'));
    }).catch(function (err) {
      showToast(_t('session.deleteFailedMsg').replace('{msg}', errorMessage(err) || 'server error'));
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

/* P2.3 — bounce the user out of an archived session. Used by
   actuallyDeleteSession when the active session is the one
   being archived; the chat view collapses back to the topic
   screen. */
export function bounceOutOfArchivedSession(): void {
  resetShareToken();
  /* Abort any active chat stream so callbacks don't write to
     state after resetState() has cleared it. */
  if (turnState.activeChatAbort) { try { turnState.activeChatAbort('archived-session'); } catch (e) { reportSwallow(e, 'session/recents.bounceOutOfArchivedSession.abortActive'); } }
  if (turnState.activeChatCtl) { try { turnState.activeChatCtl.abort(); } catch (e) { reportSwallow(e, 'session/recents.bounceOutOfArchivedSession.abortTurn'); } }
  turnState.activeChatCtl = null;
  turnState.activeChatAbort = null;
  turnState.chatStreaming = false;
  turnState.chatStopMode = false;
  try { turnState.pendingChatContent = null; } catch (e) { reportSwallow(e, 'session/recents.bounceOutOfArchivedSession.clearPendingChat'); }
  try { turnState.pendingAttachments = null; } catch (e) { reportSwallow(e, 'session/recents.bounceOutOfArchivedSession.clearPendingAttachments'); }
  resetState();
  toggleShareBtn();
  setChatIdInURL(null);
  activateMainView('topicSetup', document);
  clearLegacyMsgListChildren();
  publishReactChatRuntime({ type: 'state-synced', reason: 'archived-session-reset' });
  clearComposer('topic');
  clearComposerPlugins('topic');
  clearComposerPlugins('chat');
  const kbContent = document.getElementById('kbContent');
  if (kbContent) kbContent.innerHTML = '<div class="kb-empty">' + (typeof window.t === 'function' ? _t('tutor.kbTopicFirst') : 'Set a topic to build your knowledge map.') + '</div>';
  /* Task 3.3 — clear the teaching-plan view on full reset so a
     previous session's plan doesn't linger in the sidebar. */
  const _tpc = document.getElementById('teachingPlanContent');
  if (_tpc) _tpc.innerHTML = '';
  updateComposerBtn();
}

/* ─── Session context menu (long-press / right-click) ───
   Delete, pin/unpin, and custom label via a floating popover.
   Uses touch timer for mobile, contextmenu for desktop. */

/* When non-null, the context menu is open for this session id.
   While set, click events on the corresponding .recent-item are
   blocked via pointer-events:none on the row element, preventing
   the synthetic click from navigating. */
/* B2: _ctxMenuSessionId centralized as serverCache.ctxMenuSessionId. */
