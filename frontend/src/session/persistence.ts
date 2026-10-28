/* session/persistence.ts — extracted from main.js (B2 batch).
 * Session save pipeline (requestSave/doSave) + unload keepalive wiring.
 * Zero-behavior-change lift. Main.js-local list/stats surfaces
 * (renderRecents, the recents reconciler) resolve via window.* at call time.
 * P_recents-amplify: a save no longer awaits a full 200-row list refresh — it
 * patches its own row and asks for a throttled reconcile. See
 * session/recentsReconcile.ts.
 */
import { normalizeTurnRuntime } from '@socrates/core';
import { stateStore } from '../state/store.js';
import { saveState, deletedSessionGuard } from './saveState.ts';
import { generateId } from '../util/ids.ts';
import { pushChatIdToURL } from './store.ts';
import { serverCache } from './serverCache.ts';
import { patchSessionRow, type SavedSession } from './recentsReconcile.ts';
import { buildBeaconPayload, type BeaconPayload } from './beacon.ts';
import { buildDeltaPayload, commitSynced, createFingerprintCache, seedSynced, stateFingerprint, type MessageLike } from './saveDelta.ts';
import { generateSessionTitle } from '../chat/sessionTitle.ts';
import { markCmdKIndexDirty } from '../ui/cmdK.js';
import { toggleShareBtn } from '../ui/share.js';
import { showToast } from '../ui/toast.js';
import { apiFetch } from '../util/api.ts';
import { detailCache } from './detailCache.ts';

/** A message row in the save payload (html/rawText both travel). */
export interface SessionPostMessage extends MessageLike {
  clientId: string | null;
  role: string;
  html: string | null | undefined;
  rawText: string | null;
  type: string | null;
  reasoningContent: string | null;
  reasoningDurationSec: number | null;
  summary: unknown;
  attachments: unknown[];
  toolCalls: unknown[];
}

/** The full POST /api/sessions body captured from the store. */
export interface SessionPostPayload {
  id: string;
  topic: string;
  title: string;
  pinned: boolean;
  domain: string;
  projectId: string | null;
  assistantId: string | null;
  mode: string;
  messages: SessionPostMessage[];
  kbNodes: unknown[];
  mistakes: unknown[];
  currentNode: number;
  totalQ: number;
  phase: string;
  teachingStage: string;
  currentExampleIdx: number;
  practiceAttempts: number;
  practicePhase: string;
  teachingPlan: unknown;
  boundariesHistory: unknown[];
  mistakeFilter: string;
  branchedFrom: unknown;
  updatedAt: number;
  [key: string]: unknown;
}

type SessionTeachingProgress = Pick<
  SessionPostPayload,
  'teachingStage' | 'currentExampleIdx' | 'practiceAttempts' | 'practicePhase' | 'teachingPlan'
>;

type SessionSidebarState = Pick<SessionPostPayload, 'boundariesHistory' | 'mistakeFilter' | 'branchedFrom'>;

function captureTeachingProgress(): SessionTeachingProgress {
  return {
    teachingStage: (stateStore.read('teachingStage') as string) || 'motivate',
    currentExampleIdx: (stateStore.read('currentExampleIdx') as number) || 0,
    practiceAttempts: (stateStore.read('practiceAttempts') as number) || 0,
    practicePhase: (stateStore.read('practicePhase') as string) || 'foundation',
    teachingPlan: stateStore.read('teachingPlan') || null,
  };
}

function captureSessionSidebarState(): SessionSidebarState {
  return {
    boundariesHistory: (stateStore.read('boundariesHistory') as unknown[]) || [],
    mistakeFilter: (stateStore.read('mistakeFilter') as string) || 'all',
    branchedFrom: stateStore.read('branchedFrom') || null,
  };
}

/** The POST /api/sessions response fields the save pipeline reads. */
interface SaveResponse {
  id?: string;
  [key: string]: unknown;
}

/** Window surfaces the save pipeline reads at call time. */
interface PersistenceWindow extends Window {
  incognitoOn?: boolean;
  appMode?: string;
  renderRecents?: () => void;
  scheduleRecentsReconcile?: () => void;
  flushRecentsReconcile?: () => Promise<unknown>;
}

function _t(key: string, fallback?: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch {
    /* empty-catch: intentional — translation is best-effort */
  }
  return fallback != null ? fallback : key;
}
/* P_recents-amplify — the Recents list after a save. These go through window.*
   for the same reason the old _refreshServerSessions helper did: recents.ts and
   persistence.ts must not take a hard import cycle. The reconciler singleton
   lives in recents.ts and wraps refreshServerSessions. */
function _scheduleRecentsReconcile(): void {
  try {
    const win = window as PersistenceWindow;
    if (typeof window !== 'undefined' && typeof win.scheduleRecentsReconcile === 'function') {
      win.scheduleRecentsReconcile();
    }
  } catch {
    /* empty-catch: intentional — reconcile scheduling is best-effort */
  }
}
function _flushRecentsReconcile(): Promise<unknown> {
  try {
    const win = window as PersistenceWindow;
    if (typeof window !== 'undefined' && typeof win.flushRecentsReconcile === 'function') {
      return win.flushRecentsReconcile();
    }
  } catch {
    /* empty-catch: intentional — reconcile flushing is best-effort */
  }
  return Promise.resolve([]);
}
/* P_recents-amplify — keep the Recents list in step with the server after a
   save without re-reading all 200 rows. */
function _applySavedRow(
  saved: SavedSession | null | undefined,
  payload: SessionPostPayload,
  sentId: string,
): void {
  if (!saved || !saved.id) return;
  try {
    serverCache.sessions = patchSessionRow(serverCache.sessions, saved, payload, sentId);
  } catch {
    /* empty-catch: intentional — the reconcile will fix the row */
  }
}
function _renderRecents(): void {
  try {
    const win = window as PersistenceWindow;
    if (typeof window !== 'undefined' && typeof win.renderRecents === 'function') win.renderRecents();
  } catch {
    /* empty-catch: intentional — rendering is best-effort */
  }
}

function commitAcknowledgedSave(
  response: SaveResponse | null | undefined,
  capturedSessionId: string,
  originalSessionId: string,
  sentMessages: SessionPostMessage[],
): void {
  /* Only acknowledged rows advance the watermark; any earlier failure
     leaves them eligible for the next save attempt. */
  commitSynced(_syncedFor(capturedSessionId), sentMessages, _fingerprints);
  if (response && response.id && response.id !== originalSessionId) {
    _rekeySynced(capturedSessionId, response.id);
  }

  /* Fold exactly the acknowledged delta into both old and adopted ids. */
  const cachedId = (response && response.id) || capturedSessionId;
  detailCache.foldSave(cachedId, response, sentMessages as MessageLike[]);
  if (response && response.id && response.id !== capturedSessionId) {
    detailCache.foldSave(capturedSessionId, response, sentMessages as MessageLike[]);
  }

  /* If the user deleted this draft while POST was in flight, only rewrite a
     pending snapshot; the tombstone still prevents state adoption below. */
  if (response && response.id && response.id !== originalSessionId
    && saveState.pendingSnapshot && saveState.pendingSnapshot.id === originalSessionId) {
    saveState.pendingSnapshot.id = response.id;
  }
}

function publishAcknowledgedSave(
  response: SaveResponse | null | undefined,
  payload: SessionPostPayload,
  capturedSessionId: string,
  originalSessionId: string,
): void {
  _applySavedRow(response as SavedSession, payload, originalSessionId);
  if (deletedSessionGuard.has(capturedSessionId)) _flushRecentsReconcile();
  else _scheduleRecentsReconcile();

  /* A late response belongs to the captured session, so it may only adopt
     the server id while that session is still active. */
  if (stateStore.read('currentSessionId') === capturedSessionId && response
    && response.id && response.id !== originalSessionId) {
    stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: response.id });
    pushChatIdToURL(response.id);
  }

  /* Clear server streaming markers after the durable save. */
  const targetSid = (response && response.id) || capturedSessionId;
  if (targetSid) {
    apiFetch('/api/sessions/' + encodeURIComponent(targetSid), {
      method: 'PATCH',
      body: { streamingText: null, streamingReasoning: null },
    }).catch(function () { /* empty-catch: intentional — clearing the partial marker is best-effort */ });
  }
  _renderRecents();
}

function _appMode(): string {
  try {
    if (typeof window !== 'undefined' && (window as PersistenceWindow).appMode) return (window as PersistenceWindow).appMode as string;
  } catch {
    /* empty-catch: intentional — mode lookup is best-effort */
  }
  return 'chat';
}

export function saveCurrentSession(): Promise<unknown> | null {
  /* P_mobile-topbar — incognito ("无痕对话") sessions are never
     persisted. Entering incognito first saves any prior real session
     (toggleIncognito calls resetApp before flipping this flag), so
     bailing here only blocks the temporary conversation itself. */
  if (typeof window !== 'undefined' && (window as PersistenceWindow).incognitoOn) return null;
  if (!stateStore.read('topic')) return null;
  if (!(typeof window !== 'undefined' && window.CURRENT_USER)) return null; /* not signed in; do nothing */
  /* P_context-race — discard saves during session loading. The
     loadSession function is in the middle of rebuilding state and
     any intercepted save would capture mismatched sessionId vs
     messages, causing "会话串台" (context cross-contamination). */
  if (saveState.loadingSession) return null;
  /* If a save is already running, mark dirty and let it coalesce.
     P_save-snapshot — capture the changed state NOW, while the session that
     changed is still current, and let the queue post that payload verbatim.
     The old cascade ended in doSave(), which re-captured from live state; that
     only worked because loadSession() had to fully drain the pipeline before
     replacing the messages. With the drain gone (a session switch must not
     wait on the network) a drain-time re-capture would read the NEW session
     and post it under the OLD id.
     Every dirty call re-captures so no intermediate change is dropped; the
     slot keeps the newest complete capture, which subsumes the older ones. */
  if (saveState.saveInFlight) {
    try { saveState.pendingSnapshot = captureSessionPayload(); } catch { saveState.pendingSnapshot = null; }
    saveState.saveDirty = true;
    return saveState.saveInFlight;  /* return the existing in-flight promise */
  }
  saveState.saveDirty = false;
  saveState.pendingSnapshot = null;
  doSave();
  /* doSave() sets saveState.saveInFlight to the fetch+then promise, or leaves
     it as-is if early-exit guards (deleted session guard, empty topic)
     fired. Return it for callers that want to await completion. */
  return saveState.saveInFlight;
}


/* New-session path: persist the current conversation without blocking the
   UI on an in-flight save. When a POST is already running, the state is
   snapshotted now (before the caller resets it) and sent right after the
   running request settles, so the reset never waits on the network.

   P_reset-defer — when nothing is in flight this used to call
   saveCurrentSession() inline, which ran captureSessionPayload +
   payloadSignature + the 1 MB JSON.stringify + fetch() all inside the
   new-chat click handler. On a long session that put ~70 ms of work and
   a large allocation burst into the very frame the user is waiting on
   (INP ≈ 120 ms, one 106 ms long task).

   The payload must still be CAPTURED synchronously: the caller resets
   state on the next line, and a deferred capture would find an empty
   conversation. So capture now, and defer only the post — the stringify,
   the signature and the network call move to the next macrotask, after
   the reset has been painted. */
export function saveSessionBeforeReset(): Promise<unknown> | null {
  if (typeof window !== 'undefined' && (window as PersistenceWindow).incognitoOn) return null;
  if (!stateStore.read('topic')) return null;
  if (!(typeof window !== 'undefined' && window.CURRENT_USER)) return null;
  if (saveState.loadingSession) return null;
  const sid = stateStore.read('currentSessionId') as string | null;
  if (deletedSessionGuard.has(sid)) return null;
  if (saveState.saveInFlight) {
    saveState.pendingSnapshot = captureSessionPayload();
    saveState.saveDirty = false;
    return saveState.saveInFlight;
  }
  if (!saveState.saveDirty && _lastPosted.id === sid) {
    const curMsgs = (stateStore.read('messages') as unknown[]) || [];
    const synced = _syncedFor(sid);
    if (synced && synced.size === curMsgs.length) {
      return null;
    }
  }
  const snapshot = captureSessionPayload();
  /* P_reset-defer — park the snapshot for one tick. The pagehide beacon in
     installUnloadSave flushes it if the tab is torn down inside that window,
     so deferring cannot cost the user a conversation. */
  saveState.deferredSnapshot = snapshot;
  return new Promise(function (resolve) {
    setTimeout(function () {
      if (saveState.deferredSnapshot === snapshot) saveState.deferredSnapshot = null;
      /* Re-check under the deferred tick: the user may have switched
         sessions or deleted this one in the frame we yielded for. */
      if (deletedSessionGuard.has(snapshot.id)) { resolve(null); return; }
      if (saveState.saveInFlight) {
        /* Something started a save while we yielded — hand the snapshot
           to the coalescing queue instead of racing it. */
        saveState.pendingSnapshot = snapshot;
        saveState.saveDirty = false;
        resolve(saveState.saveInFlight);
        return;
      }
      resolve(postSession(snapshot));
    }, 0);
  });
}

function doSave(): void {
  /* Guard against saving after state has been reset — the
     saveState.saveDirty cascade in saveCurrentSession bypasses the
     stateStore.read("topic") check after the first in-flight save finishes.
     Without this guard, deleting a session while a save is
     in-flight causes the queued doSave() to POST empty state
     to the server, creating a ghost session. */
  /* P_delete-resurrect — refuse to POST a session the user has
     already deleted on this page. The check fires BEFORE the
     stateStore.read("topic") guard (which is the original guard) because a
     session whose topic was retained after delete (e.g. the
     "give it back so the user can re-create it" UX I'd half-
     designed at one point) would otherwise bypass the topic
     check and silently re-insert the deleted row. */
  const sid = stateStore.read('currentSessionId') as string | null;
  if (deletedSessionGuard.has(sid)) {
    saveState.saveInFlight = null;
    saveState.saveDirty = false;
    return;
  }
  if (saveState.loadingSession) {
    saveState.saveDirty = false;
    return;
  }
  if (!stateStore.read('topic')) return;
  const payload = captureSessionPayload();
  const sessionId = payload.id;
  /* P_dup-session — sync the namespace mirror too. Without this,
     a second saveCurrentSession in the same tick reads
     stateStore.read("currentSessionId") (still null because line 1228
     only fires after the server responds), regenerates a new id,
     and the server creates a SECOND session record — the user
     sees the same chat appear twice in Recents. The two fields
     have to stay in lock-step synchronously, not just on the
     async POST response. */
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: sessionId });
  toggleShareBtn();
  /* Kick off AI title generation based on the user's first input. */
  generateSessionTitle();
  payload.title = (stateStore.read('sessionTitle') as string) || payload.title;
  /* Mark Cmd-K search index dirty instead of rebuilding during interaction. */
  markCmdKIndexDirty();
  /* Fire-and-forget write to server. The local SERVER_SESSIONS cache is
     refreshed on next renderRecents; we don't block the UI on the roundtrip.
     P0.0 — adopt the server's canonical session id when it differs
     from what we sent. Pre-UUID fix the client generated identifiers
     like "mq61wc16-ayb8j6" and the server swapped in a fresh UUID
     before inserting. Without this adoption step, every subsequent
     save kept sending the original (rejected) id, breaking the upsert
     and producing duplicate rows. */
  postSession(payload);
}

/* Snapshot the active session into a POST payload without touching state. */
function captureSessionPayload(): SessionPostPayload {
  const now = Date.now();
  /* P1.1 — read from the authoritative stateStore.read("messages") list, NOT
     from the live DOM. The DOM may still hold a half-rendered
     streaming bubble (text content only, no KaTeX), and reading
     partial innerHTML was a known source of "messages got mangled"
     reports on reload. We render once at finish() time and store
     both rawText and html.

     P_streaming-save — EXCLUDE messages whose `type` is "streaming"
     (the in-progress placeholder that addStreamingMessage pushes into
     stateStore.read("messages")). If we save while a stream is in flight, the
     placeholder gets committed to the messages table with an empty /
     partial rawText. The server now upserts by clientId (sessions.js
     onConflictDoUpdate, NOTE-P01-05: this replaced the old insert-only
     path), so a later finish() save CAN overwrite the placeholder, but
     persisting half-rendered content is still wrong: a reload between
     the streaming save and the finish() save would surface a truncated
     reply, and it churns needless writes. Filtering streaming
     placeholders here is the root fix; they are only persisted after
     finish() flips type to "assistant". */
  const messages: SessionPostMessage[] = (stateStore.read('messages') as SessionPostMessage[])
    .filter(function (m) { return m.type !== 'streaming'; })
    .map(function (m) {
      return {
        clientId: m.clientId || null,
        role: m.role,
        html: m.html,
        rawText: m.rawText || null,
        type: m.type || null,
        reasoningContent: m.reasoningContent || null,
        reasoningDurationSec: m.reasoningDurationSec || null,
        summary: m.summary || null,
        turnRuntime: normalizeTurnRuntime(m.turnRuntime),
        /* P_attachments — round-trip the inlined image dataUrl /
         * parsed text body so reloads restore thumbnails without a
         * re-upload. The server caps to 20 in sessions.js; we
         * trim here too to keep payloads small. */
        attachments: Array.isArray(m.attachments) ? m.attachments.slice(0, 20) : [],
        /* P_tool-history — persist tool-call cards (including artifact
         * image IDs) so session reload re-renders the cards and their
         * images. Without this, toolCalls are silently dropped at save
         * time and never restored on reload. */
        toolCalls: Array.isArray(m.toolCalls) ? m.toolCalls.slice(0, 20) : [],
      };
    });
  const sessionId = (stateStore.read('currentSessionId') as string) || generateId();
  const payload: SessionPostPayload = {
    id: sessionId,
    topic: stateStore.read('topic') as string,
    title: (stateStore.read('sessionTitle') || stateStore.read('topic')) as string,
    pinned: !!serverCache.sessions.find((row) => row.id === sessionId)?.pinned,
    domain: (stateStore.read('domain') || stateStore.read('topic')) as string,
    projectId: (stateStore.read('currentProjectId') as string) || null,
    assistantId: sessionStorage.getItem('socrates-active-assistant') || null,
    mode: _appMode(),
    messages: messages,
    kbNodes: stateStore.read('kbNodes') as unknown[],
    mistakes: (stateStore.read('mistakes') as unknown[]) || [],
    currentNode: stateStore.read('currentNode') as number,
    totalQ: stateStore.read('totalQ') as number,
    phase: stateStore.read('phase') as string,
    /* Task 2.4 — persist the teaching-stage state machine so a
       reloaded session resumes at the right stage. The backend
       sessions.js uses .passthrough() so these extra fields are
       accepted without schema changes. */
    ...captureTeachingProgress(),
    /* v3.0 design — knowledge boundary history (snapshots) and
       mistake filter are also persisted so the sidebar state
       survives reloads. */
    ...captureSessionSidebarState(),
    /* P1.1 — persist branchedFrom metadata so a reloaded session
       shows "Branched from ..." in the sidebar. */
    updatedAt: now,
  };
  return payload;
}

/* P_save-dedup — the 2026-09-27 profile caught two content-identical
 * POST /api/sessions firing at the end of a single streamed turn: several
 * saveCurrentSession() call sites run in the same tick, and the
 * saveState.saveDirty cascade re-runs doSave() after the first POST settles,
 * capturing byte-identical state. Each POST is the WHOLE session (O(N) in
 * message count, ~1 MB for a long chat) plus a PATCH + a 200-row list
 * refresh, so the duplicate doubles the write load for nothing. Remember the
 * signature of the last body we actually sent and skip a re-save that would
 * post the same bytes. Any real change (new message, edited html, retitled
 * session) moves the signature and posts normally. */
const _lastPosted: { id: string | null; sig: string | null } = { id: null, sig: null };

/* P_incremental-save — reduce each save to the rows the server is not
 * already known to hold. The pure delta/fingerprint logic lives in
 * session/saveDelta.ts so it can be unit-tested without the DOM globals
 * this module installs at import time; see that file for why deletions
 * do not travel through the save payload.

 * The watermark is per session: clientId -> fingerprint of the last body
 * the server ACKNOWLEDGED. It advances only inside the POST's success
 * path (commitSynced), so a failed save re-sends the same rows next time
 * instead of dropping them. */
const _syncedBySession = new Map<string, Map<string, string>>();
const _SYNCED_SESSION_CAP = 8;
const _fingerprints = createFingerprintCache();

function _syncedFor(sessionId: string | null | undefined): Map<string, string> {
  const key = sessionId || '';
  let got = _syncedBySession.get(key);
  if (!got) {
    got = new Map<string, string>();
    _syncedBySession.set(key, got);
    /* Bounded: an active user cycles through a handful of sessions, and
       every entry here holds one string per message. */
    while (_syncedBySession.size > _SYNCED_SESSION_CAP) {
      const oldest = _syncedBySession.keys().next().value;
      if (oldest === undefined || oldest === key) break;
      _syncedBySession.delete(oldest);
    }
  }
  return got;
}

/* Seed the watermark from a freshly loaded session so the first save
   after a switch is a delta rather than a full re-upload. Without this
   the delta would only ever help mid-conversation. Called by
   session/loader.ts right after the messages land in state. */
export function seedSyncedMessages(sessionId: string | null | undefined, messages: unknown): void {
  if (!sessionId) return;
  seedSynced(_syncedFor(sessionId), messages, _fingerprints);
}

/* Keep the watermark when a brand-new session is adopted under a
   server-minted UUID, so the next save is still a delta. */
function _rekeySynced(fromId: string | null | undefined, toId: string | null | undefined): void {
  if (!fromId || !toId || fromId === toId) return;
  const got = _syncedBySession.get(fromId);
  if (!got) return;
  _syncedBySession.set(toId, got);
  _syncedBySession.delete(fromId);
}

function payloadSignature(payload: SessionPostPayload): string {
  const msgs = Array.isArray(payload.messages) ? payload.messages : [];
  let parts = '';
  for (let i = 0; i < msgs.length; i++) {
    /* P_signature-content — this used to be
     *   clientId + ':' + html.length + ':' + rawText.length
     * i.e. a LENGTH-ONLY comparison. A message rewritten to a different
     * text of the same length produced an identical signature, so the
     * "skip an identical re-save" short-circuit below silently dropped
     * the edit. Reuse the same memoised content fingerprint the delta
     * uses, so an unchanged message still costs one pointer compare. */
    parts += _fingerprints.of(msgs[i] || {}) + ';';
  }
  /* P_signature-scope — the signature drives the "skip an identical
     re-save" short-circuit, so ANY field whose change must reach the
     server has to appear here. It previously covered only
     title/phase/topic/message-shape/kbNodes.length/mistakes.length, which
     meant the tutor state machine (teachingStage, currentNode, totalQ,
     teachingPlan, boundariesHistory — all mutated every turn by
     chat/sendPipeline.js) could change and the save would be silently
     dropped. FNV-1a over the serialised state keeps this O(size of the
     tutor state) rather than O(whole transcript). */
  const tutorFingerprint = stateFingerprint;
  return [payload.title || '', payload.phase || '', payload.topic || '',
    msgs.length, parts, Array.isArray(payload.kbNodes) ? payload.kbNodes.length : 0,
    Array.isArray(payload.mistakes) ? payload.mistakes.length : 0,
    payload.teachingStage || '', payload.currentNode || '', payload.totalQ || 0,
    tutorFingerprint(payload.teachingPlan), tutorFingerprint(payload.boundariesHistory),
  ].join('#');
}

/* P_save-snapshot — finish the queue once the in-flight save settles.
   Posts the captured payload verbatim instead of re-capturing live state, so
   this is safe to run while the user is already in a different session. The
   doSave() fallback only runs when nothing was captured, and never during a
   load: a live re-capture there would read the incoming conversation and post
   it under the outgoing session's id. */
function drainSaveQueue(): void {
  saveState.saveInFlight = null;
  const queued = saveState.pendingSnapshot;
  saveState.pendingSnapshot = null;
  if (queued && !deletedSessionGuard.has(queued.id as string)) {
    /* The slot holds the newest complete capture of the changed session, so
       posting it also discharges the dirty flag. */
    saveState.saveDirty = false;
    postSession(queued as SessionPostPayload);
    return;
  }
  if (saveState.saveDirty) {
    saveState.saveDirty = false;
    if (saveState.loadingSession) return;
    doSave();
  }
}

function postSession(payload: SessionPostPayload): Promise<unknown> {
  const sessionId = payload.id;
  /* P_save-dedup — skip a byte-identical re-save; still advance the queue so a
     pending snapshot / dirty flag is not stranded. */
  const sig = payloadSignature(payload);
  if (sessionId === _lastPosted.id && sig === _lastPosted.sig) {
    drainSaveQueue();
    return Promise.resolve();
  }
  _lastPosted.id = sessionId; _lastPosted.sig = sig;
  /* P_cache-foldsave — this used to be `detailCache.invalidate(sessionId)`.
     Dropping the entry on every save meant the session most likely to be
     revisited — the one the user just chatted in — was the one that could
     never hit the cache, which is the opposite of what SWR is for. The row
     delta is not known until the POST is built below, and the acknowledgement
     lands in the success handler, so the fold happens there. Until then the
     stale copy is not served: loadSession() reconciles a hit against a live
     fetch and re-paints on a signature mismatch, so the worst case is one
     extra round-trip, not a wrong transcript. */
  /* P_context-race — snapshot the session ID at capture time so the
     POST callback can detect whether a session switch happened while
     the request was in-flight. If the active session changed, the
     POST response (server-adopted id) must NOT overwrite the new
     session's URL / state. */
  const capturedSessionId = sessionId;
  /* P_incremental-save — send only the rows the server is not already
     known to hold. The watermark advances only in the success handler
     below, for exactly the rows that were acknowledged. */
  const body = buildDeltaPayload(payload, _syncedFor(capturedSessionId), _fingerprints);
  const sentMessages = body.messages as SessionPostMessage[];
  saveState.saveInFlight = apiFetch<SaveResponse>('/api/sessions', { method: 'POST', body: body }).then(function (response) {
    commitAcknowledgedSave(response, capturedSessionId, sessionId, sentMessages);
    publishAcknowledgedSave(response, payload, capturedSessionId, sessionId);
  }).catch(function (e) {
    /* F1a — surface the save failure so the user knows their
       conversation isn't being persisted. Without this the recent
       list can silently lose new entries (Bug1). The default 1800ms
       timeout is too short for an error toast, so this uses the
       shared toast's longer-lived error variant. */
    const err = e as { message?: string; requestId?: string } | null;
    showToast(_t('sessions.save_failed', 'Save failed') + ': ' + (err?.message || '') + (err?.requestId ? (' (ref ' + err.requestId + ')') : ''), { variant: 'error', duration: 5000 });
  }).then(function () {
    /* Clear the in-flight flag BEFORE re-checking dirty so a queued save
       picks up the latest state (and the just-adopted server id, if any)
       instead of re-sending a stale id. */
    drainSaveQueue();
  });
  return saveState.saveInFlight;
}


/* P_save-on-unload — page lifecycle handlers that prevent loss of
 * the latest AI response when the user refreshes or closes the tab
 * before the async saveCurrentSession() POST completes.
 *
 * beforeunload: Shows a "Leave site?" confirmation dialog if a save
 *   is still in-flight, giving it time to complete. The user can
 *   choose to stay (letting the save finish) or leave anyway.
 *
 * pagehide: Fires after beforeunload, right before the page is torn
 *   down. Uses fetch(keepalive:true) as a last-chance save attempt
 *   so the server receives the session data even if the page unloads. */
export function installUnloadSave(): void {
  /* P_save-unload-ref — read CSRF token synchronously from the cookie
     (available during page teardown). Same pattern as getCsrfToken in
     util/api.ts but inlined to avoid an import dependency. */
  function _beaconCsrf(): string | null {
    const m = document.cookie.match(/\bcsrf=([^;]+)/);
    return m ? m[1] : null;
  }
  function _beaconSave(): void {
    /* P_reset-defer — a snapshot parked by saveSessionBeforeReset is the
       authority here: the caller has already reset the live state, so the
       store-based branch below would find an empty conversation. Flush the
       parked snapshot first, then fall back to the live-state path. */
    const deferred = saveState.deferredSnapshot;
    if (deferred) {
      _beaconPost(deferred as SessionPostPayload);
      return;
    }
    /* Only fire if we have data worth saving and a save is pending. */
    if (!saveState.saveInFlight || !stateStore.read('currentSessionId') || !(typeof window !== 'undefined' && window.CURRENT_USER)) return;
    /* F3: payload shape lives in session/beacon.ts (unit-tested); the
       keepalive wiring stays here because it runs during page teardown. */
    const payload = buildBeaconPayload({
      sessionId: stateStore.read('currentSessionId') as string,
      topic: stateStore.read('topic') as string,
      sessionTitle: stateStore.read('sessionTitle') as string,
      appMode: _appMode(),
      messages: stateStore.read('messages'),
    });
    if (!payload) return;
    _beaconPost(payload);
  }
  /* Raw keepalive fetch — apiFetch uses AbortController + JSON parsing which
     is incompatible with keepalive during pagehide. */
  function _beaconPost(payload: SessionPostPayload | BeaconPayload): void {
    const csrf = _beaconCsrf();
    try {
      fetch('/api/v2/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify(payload),
        credentials: 'include',
        keepalive: true,
      }).catch(function () { /* empty-catch: intentional — the page is going away */ });
    } catch {
      /* empty-catch: intentional — the page is going away */
    }
  }
  /* beforeunload — show confirmation if a save is in-flight. */
  window.addEventListener('beforeunload', function (e) {
    if (saveState.saveInFlight) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  /* pagehide — last-chance keepalive fetch (fires before the page is
     torn down). Also fire on visibilitychange as a secondary guard. */
  window.addEventListener('pagehide', _beaconSave);
  window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') _beaconSave();
  });
}

installUnloadSave();
