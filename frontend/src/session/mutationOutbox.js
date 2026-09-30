// src/session/mutationOutbox.js — durable replay queue for message edits
// that never reached the server.
//
// ── Why this exists ────────────────────────────────────────────────────
//
// Editing a user turn (or deleting a message) mutates the server through
// PATCH /api/messages/:id?discardFollowing=true and DELETE
// /api/messages/:id. When either request fails — the common case being a
// phone that lost signal mid-edit — the client applies the change locally
// anyway and shows "Saved locally — will sync when back online".
//
// That promise was not backed by anything. The whole-session save
// (POST /api/sessions) only ever *upserts* rows; there is no DELETE on
// `messages` anywhere in the save path (see the M3 note in
// server/src/routes/sessions.ts). So after a failed edit:
//
//   1. the local transcript is trimmed to the edited turn,
//   2. the server still holds the old user text and the old replies,
//   3. the next save re-uploads the new text but cannot delete anything,
//   4. a hard reload re-hydrates from the server and the discarded
//      replies come back — usually sitting next to the fresh ones,
//      because the reload picked up both the stale rows and the new turn.
//
// The edit silently un-does itself. This queue is what makes the toast
// true.
//
// ── Why the queue replays explicit deletes, not the PATCH ─────────────
//
// The tempting replay is to re-send the original PATCH. It is wrong.
// `discardFollowing` deletes *every* row after the edited turn
// (server/src/routes/messages.ts:178-197). Replaying a prune that was
// queued ten minutes ago would delete the turns the user produced *after*
// reconnecting — the exact data the queue exists to protect.
//
// So the queue stores the two halves of the edit separately:
//
//   { type: 'patch',  id, content }  → rewrite the edited turn's text.
//                                      Idempotent; last write wins, which
//                                      is correct when the same turn was
//                                      edited twice while offline.
//   { type: 'delete', id }           → remove one specific discarded row.
//
// Every op is individually idempotent, so replaying a partially-succeeded
// batch is safe: a 404 from a delete means the row is already gone.
//
// ── Storage ────────────────────────────────────────────────────────────
//
// localStorage, not memory. The dominant failure is "user closed the tab
// while still offline", so an in-memory queue would lose exactly the
// mutations it exists to preserve. Namespaced under the socrates- prefix
// like every other persisted key in the app; every access is wrapped
// because a full or disabled localStorage must never break editing.

import { apiFetch } from '../util/api.js';

const STORAGE_KEY = 'socrates-msg-outbox-v1';

/* A user who edits wildly on a plane should not be able to grow this
   without bound. At ~120 bytes per op the cap is roughly 60 KB, well
   inside the typical 5 MB budget, and dropping the OLDEST ops is the safe
   direction: the newest edit is the one the user still believes in. */
const MAX_OPS = 500;

/** Single-flight guard: `online` and boot can both fire within a tick. */
let draining = false;

function readQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (op) => op && typeof op.id === 'string' && (op.type === 'patch' || op.type === 'delete'),
    );
  } catch {
    /* Corrupt JSON or a storage that throws on read — start clean rather
       than wedging the edit path. Nothing here is worth a crash. */
    return [];
  }
}

function writeQueue(ops) {
  try {
    if (!ops.length) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ops.slice(-MAX_OPS)));
  } catch {
    /* Quota exceeded or private-mode storage. The edit still works
       locally; only the replay guarantee is lost, and the caller already
       told the user the change was saved locally. */
  }
}

/**
 * Build the API path for a message, scoped to an explicit session.
 *
 * `messageApiPath` (ui/messageActions.ts) reads currentSessionId from the
 * store, which is wrong here: a drain can run while the user is looking
 * at a *different* session, and we need to address the session the op was
 * queued against. The sessionId is also what lets the server's
 * ownership check reject an op whose session no longer exists.
 */
function opPath(sessionId, id) {
  const path = '/api/messages/' + encodeURIComponent(id);
  if (sessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    return path + '?sessionId=' + encodeURIComponent(sessionId);
  }
  return path;
}

/**
 * Record one failed message mutation for later replay.
 *
 * Call this from the `.catch` of an edit / delete request. Queuing is
 * best-effort and never throws.
 *
 * @param {string|null} sessionId  session the message belonged to
 * @param {string} id              message clientId (the server resolves
 *                                 both id and clientId through
 *                                 findOwnedMessage)
 * @param {'patch'|'delete'} type
 * @param {string} [content]       new text, required for 'patch'
 */
export function queueMessageOp(sessionId, id, type, content) {
  if (!id || (type !== 'patch' && type !== 'delete')) return;
  if (type === 'patch' && typeof content !== 'string') return;
  const ops = readQueue();
  ops.push({ sessionId: sessionId || null, id, type, content, queuedAt: Date.now() });
  writeQueue(ops);
}

/** Number of mutations still waiting to reach the server. */
export function pendingOpCount() {
  return readQueue().length;
}

/** Exposed for tests: the sanitised queue as it would be replayed. */
export function readQueueForTest() {
  return readQueue();
}

/**
 * Replay every queued mutation, oldest first.
 *
 * Stops at the first op that fails for a reason other than "already gone"
 * and leaves the rest queued: a network that just came back can still be
 * flaky, and hammering it once per op would only make it worse. The
 * common case — user reconnects once and the queue drains in one pass —
 * is unaffected.
 *
 * Safe to call repeatedly; concurrent calls collapse via `draining`.
 */
export async function drainMessageOutbox() {
  if (draining) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;

  const ops = readQueue();
  if (!ops.length) return 0;

  draining = true;
  let done = 0;
  try {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      try {
        if (op.type === 'patch') {
          /* discardFollowing is deliberately false: the stale rows are
             already queued as explicit deletes above, and re-asserting
             the "delete everything after" semantic here is what would
             eat turns created after the drain started. */
          await apiFetch(opPath(op.sessionId, op.id), {
            method: 'PATCH',
            body: { content: op.content, regenerate: false, discardFollowing: false },
          });
        } else {
          await apiFetch(opPath(op.sessionId, op.id), { method: 'DELETE' });
        }
      } catch (e) {
        /* 404 means the row is already absent — for a delete that is
           success, and for a patch it means the session was deleted
           server-side, where re-creating the turn would be wrong. Either
           way, drop it and move on. */
        if (!e || e.status !== 404) break;
      }
      done = i + 1;
      /* Persist progress as we go, not at the end: a drain interrupted by
         a tab close must not replay ops the server already accepted. */
      writeQueue(ops.slice(i + 1));
    }
    return done;
  } finally {
    draining = false;
  }
}

/**
 * Start draining whenever the browser reports it is back online.
 *
 * The listener is installed once per module instance; `bootstrapOutbox`
 * is called from app bootstrap. Kept separate from `drainMessageOutbox`
 * so the listener survives hot reloads without stacking up.
 */
let wired = false;
export function bootstrapOutbox() {
  if (wired) return;
  wired = true;

  const onOnline = () => {
    drainMessageOutbox().then((n) => {
      if (n > 0) {
        try {
          if (typeof window.saveCurrentSession === 'function') window.saveCurrentSession();
        } catch (_) { /* a save failure here is not worth surfacing */ }
      }
    });
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', onOnline);
  }
  /* Also try once at boot: the user may have queued edits in a tab that
     was closed and reopened after the network came back. */
  onOnline();
}
