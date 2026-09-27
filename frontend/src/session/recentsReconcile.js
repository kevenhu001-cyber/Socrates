/* session/recentsReconcile.js — keep the Recents list correct without
   re-fetching all 200 rows after every save.

   P_recents-amplify (2026-09-27 session-switch profile) — every successful
   POST /api/sessions used to chain a full
   `GET /api/sessions?limit=200&archived=true` before `saveInFlight` settled.
   One chat turn fires saveCurrentSession() from several call sites, and
   loadSession() then DRAINED that whole chain before it would even issue the
   detail fetch — so switching sessions right after a turn cost three serial
   round-trips (POST → 200-row list GET → PATCH) before the transcript request
   went out. The 2026-09-27 profile could not see it: the harness ran at
   RTT ≈ 0 with the list refresh stubbed out, and the report noted
   "S3 保存放大 — 部分观测 … 链路被 mock 吞掉".

   The split is:
     • the save response already carries every scalar the list row renders
       (sessions.ts P_save-response), so ONE row is patched locally;
     • a coalesced + throttled background reconcile handles anything a local
       patch cannot know (rows created elsewhere, archived, deleted, retitled
       by another tab).

   Everything here is pure / injectable so it can be unit-tested without the
   DOM globals persistence.js and loader.js install at import time.
 */

/* Minimum gap between two background list reconciles. A save burst collapses
   into a single fetch; a user who keeps talking gets at most one list
   refresh per window instead of one per turn. */
export var RECONCILE_MIN_INTERVAL_MS = 4000;

/* Fields the save response is authoritative for, and the row keys each one
   lands on. The list endpoint returns snake_case (`total_q`, `updated_at`)
   while the save response returns Drizzle's camelCase (`totalQ`, `updatedAt`)
   — and `getVisibleSessions()` sorts on `updated_at` while `_sessionRowFields`
   reads `total_q || totalQ`. Writing both keys keeps the patched row correct
   whichever shape it already had.

   Anything not listed (tags, domain, preview) never changes on a save, so the
   row keeps whatever the last real fetch gave it. */
var SCALAR_FIELDS = [
  { from: 'topic', to: ['topic'] },
  { from: 'title', to: ['title'] },
  { from: 'mode', to: ['mode'] },
  { from: 'kind', to: ['kind'] },
  { from: 'phase', to: ['phase'] },
  { from: 'totalQ', to: ['totalQ', 'total_q'] },
  { from: 'pinned', to: ['pinned'] },
  { from: 'archivedAt', to: ['archivedAt'] },
  { from: 'createdAt', to: ['createdAt', 'created_at'] },
  { from: 'updatedAt', to: ['updatedAt', 'updated_at'] },
  { from: 'projectId', to: ['projectId'] },
  { from: 'branchedFrom', to: ['branchedFrom'] },
];

function pick(source, key) {
  if (source[key] != null) return source[key];
  /* Tolerate a snake_case response body as well, so this keeps working if the
     endpoint is ever serialized differently. */
  var snake = key.replace(/[A-Z]/g, function (c) { return '_' + c.toLowerCase(); });
  return source[snake];
}

function indexOfId(sessions, id) {
  for (var i = 0; i < sessions.length; i++) {
    if (sessions[i] && sessions[i].id === id) return i;
  }
  return -1;
}

/* Build a list row for a session the server just created. There is nothing to
   patch yet, so this is a row the next reconcile would have created anyway —
   built from the save response plus the payload we just sent, which together
   cover every field `_sessionRowFields` (organize.js) reads. */
function buildFreshRow(saved, payload) {
  return {
    id: saved.id,
    topic: saved.topic || payload.topic || '',
    title: saved.title || payload.title || '',
    domain: payload.domain || '',
    mode: saved.mode || payload.mode || '',
    phase: saved.phase || payload.phase || '',
    kind: saved.kind || '',
    projectId: saved.projectId != null ? saved.projectId : (payload.projectId || null),
    pinned: !!saved.pinned,
    archivedAt: saved.archivedAt == null ? null : saved.archivedAt,
    /* getVisibleSessions() sorts on updated_at first, so the row has to carry
       the same key the server's list endpoint returns. */
    updated_at: saved.updatedAt || saved.updated_at || null,
    created_at: saved.createdAt || saved.created_at || null,
    total_q: saved.totalQ || 0,
    tags: [],
    branchedFrom: saved.branchedFrom || null,
  };
}

/**
 * Patch (or insert) the row for one saved session. Returns a NEW array; the
 * input is never mutated.
 *
 * @param {Array}  sessions  current list rows
 * @param {object} saved     the POST /api/sessions response body
 * @param {object} [payload] the request payload, used only when the row is new
 * @param {string} [rekeyFrom] an id the row is currently filed under, used
 *   when the server minted its own UUID for a client-drafted session
 * @returns {Array} the updated list
 */
export function patchSessionRow(sessions, saved, payload, rekeyFrom) {
  if (!saved || !saved.id) return Array.isArray(sessions) ? sessions : [];
  var list = Array.isArray(sessions) ? sessions : [];

  /* The server replaced a client-drafted id with a canonical UUID. Re-file the
     row under the real id first, so the patch below finds it. If the canonical
     row is already listed the draft is a duplicate — drop it rather than
     renaming it into a second row with the same id. */
  if (rekeyFrom && rekeyFrom !== saved.id) {
    var from = indexOfId(list, rekeyFrom);
    if (from >= 0) {
      if (indexOfId(list, saved.id) >= 0) {
        var dropped = list.slice();
        dropped.splice(from, 1);
        list = dropped;
      } else {
        var rekeyed = list.slice();
        rekeyed[from] = Object.assign({}, rekeyed[from], { id: saved.id });
        list = rekeyed;
      }
    }
  }

  var idx = indexOfId(list, saved.id);
  if (idx < 0) {
    /* Brand-new session. Without a payload we have no `domain`/`tags`, and
       guessing them would paint a half-right row; let the reconcile catch it
       instead. */
    if (!payload) return list;
    return [buildFreshRow(saved, payload)].concat(list);
  }

  var patched = Object.assign({}, list[idx]);
  for (var f = 0; f < SCALAR_FIELDS.length; f++) {
    var value = pick(saved, SCALAR_FIELDS[f].from);
    /* Skipping null is deliberate: a real 0 (totalQ) must land, but a null
       archivedAt means "unchanged", not "archive it". */
    if (value == null) continue;
    for (var k = 0; k < SCALAR_FIELDS[f].to.length; k += 1) {
      patched[SCALAR_FIELDS[f].to[k]] = value;
    }
  }

  var next = list.slice();
  next[idx] = patched;
  return next;
}

/**
 * A coalescing, throttling scheduler around the (expensive) list fetch.
 *
 * schedule() — fold a request into the next allowed window. Repeated calls
 *   inside one window collapse into a single fetch.
 * flush()   — run right now and drop any pending timer. Use when the caller
 *   genuinely cannot show stale rows (delete / archive / restore / login).
 *
 * @param {{refresh:Function, onDone?:Function, minIntervalMs?:number,
 *          now?:Function, setTimer?:Function, clearTimer?:Function}} options
 */
export function createReconciler(options) {
  var refresh = options.refresh;
  var onDone = options.onDone || function () { return undefined; };
  var minIntervalMs = options.minIntervalMs == null
    ? RECONCILE_MIN_INTERVAL_MS
    : options.minIntervalMs;
  var now = options.now || function () { return Date.now(); };
  var setTimer = options.setTimer || function (fn, ms) { return setTimeout(fn, ms); };
  var clearTimer = options.clearTimer || function (handle) { clearTimeout(handle); };

  var timer = null;
  var running = false;
  var rerunRequested = false;
  /* Seed with now() so the FIRST save-triggered reconcile waits a full window
     instead of firing instantly — that is the whole point. Callers that need
     the list immediately (boot, delete, archive) use flush(). */
  var lastRunAt = now();

  function run() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    /* A flush() landing mid-flight must not start a second concurrent fetch
       over the same cache; queue exactly one follow-up instead. */
    if (running) {
      rerunRequested = true;
      return Promise.resolve();
    }
    running = true;
    lastRunAt = now();
    var started;
    try {
      started = Promise.resolve(refresh());
    } catch (err) {
      started = Promise.reject(err);
    }
    /* Swallow refresh errors here: the list keeps its current shape and the
       "Couldn't load sessions — Retry" affordance is driven by the refresh
       function's own fetchFailed flag, not by this promise. */
    return started.then(onDone, onDone).then(function () {
      running = false;
      if (rerunRequested) {
        rerunRequested = false;
        schedule();
      }
    });
  }

  function schedule() {
    if (timer !== null) return;   // already folded into the open window
    var wait = Math.max(0, minIntervalMs - (now() - lastRunAt));
    timer = setTimer(function () {
      timer = null;
      run();
    }, wait);
  }

  return {
    schedule: schedule,
    flush: run,
    isScheduled: function () { return timer !== null; },
  };
}
