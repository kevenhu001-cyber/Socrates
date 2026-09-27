/* session/detailCache.js — P2 stale-while-revalidate session-detail cache.
 *
 * apiFetch forces `cb=<ts>` + `no-store` on every GET (util/api.js), so
 * switching between history sessions re-paid the full round-trip AND the
 * JSON.parse of a multi-megabyte detail payload every single time — the
 * 2026-09-27 profile showed a revisit costing the same as a first visit
 * (P3 ≈ P1). This is an in-memory, per-tab cache of the raw
 * GET /api/sessions/:id response, used ONLY as a fast first paint:
 *
 *   loadSession hit  → paint the cached copy instantly, then fetch in the
 *                       background and re-paint only if the server copy
 *                       actually differs (signature mismatch).
 *   loadSession miss → unchanged: await the network, then remember it here.
 *
 * It never becomes the source of truth on its own — every hit is reconciled
 * against a live fetch — so correctness is preserved; only latency moves.
 * Entries are dropped on save / delete / archive (see invalidate callers) and
 * after MAX_AGE, and the whole cache is bounded by entry count and per-entry
 * serialized size so a pile of long sessions can't balloon memory.
 *
 * Exported as a plain object (not a class) to match the other session/*.js
 * modules and to keep the unit test free of import-order concerns.
 */

import { apiFetch } from '../util/api.js';

var MAX_ENTRIES = 8;
var MAX_ENTRY_BYTES = 3_000_000;   // 3 MB serialized cap per session
var MAX_AGE_MS = 600_000;          // 10 min: after this a hit is treated as a miss

/* id -> { response, sig, at } ; Map preserves insertion order = LRU. */
var _entries = new Map();
var _inflightPrefetches = new Map();

/* A cached entry fetched this recently is not re-fetched in the background:
   the same tab just read it, and every local write path (save / delete /
   archive) invalidates it. Rapid back-and-forth switching used to pay one
   full detail GET + JSON.parse per click. */
var REVALIDATE_AFTER_MS = 30_000;

/* Size estimate for the cap. This used to JSON.stringify the whole response
   on every store — a multi-hundred-KB serialisation on each switch just to
   read `.length`. The message bodies dominate the payload, so summing their
   string fields (plus a per-row allowance for keys and small fields) is
   within a few percent and costs nothing. */
function serializedBytes(response) {
  var msgs = Array.isArray(response.messages) ? response.messages : [];
  var total = 2048;
  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i];
    if (!m) continue;
    total += 256 + (m.html ? m.html.length : 0) + (m.rawText ? m.rawText.length : 0)
      + (m.reasoningContent ? m.reasoningContent.length : 0);
    if (Array.isArray(m.attachments) && m.attachments.length) {
      for (var a = 0; a < m.attachments.length; a++) {
        var at = m.attachments[a];
        if (at) total += 128 + (at.dataUrl ? at.dataUrl.length : 0) + (at.text ? at.text.length : 0);
      }
    }
    if (Array.isArray(m.toolCalls) && m.toolCalls.length) {
      try { total += JSON.stringify(m.toolCalls).length; } catch (_) { return Infinity; }
    }
  }
  return total;
}

/**
 * Cheap stable fingerprint of the fields that change what loadSession paints.
 * Deliberately excludes updatedAt (bumps on every save even when nothing the
 * renderer reads moved) and includes a sum of html lengths so an in-place edit
 * that keeps the same message id still trips a re-paint.
 */
export function signature(s) {
  if (!s || typeof s !== 'object') return '';
  var msgs = Array.isArray(s.messages) ? s.messages : [];
  var ids = '';
  var htmlLen = 0;
  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i] || {};
    ids += (m.id || m.clientId || '') + ',';
    htmlLen += (m.html || '').length;
  }
  return [
    s.title || '', s.topic || '', s.phase || '', s.kind || '',
    msgs.length, htmlLen, ids,
    s.streamingText ? '1' : '0',
  ].join('#');
}

/** Return a live (unexpired) entry, bumping its LRU rank, or null. */
export function lookup(id) {
  var e = _entries.get(id);
  if (!e) return null;
  if (Date.now() - e.at > MAX_AGE_MS) { _entries.delete(id); return null; }
  _entries.delete(id); _entries.set(id, e);
  return e;
}

/** Remember a freshly-fetched response for `id` (subject to the size caps). */
export function store(id, response, sig) {
  if (!id || !response || typeof response !== 'object') return;
  if (response.kind === 'exam') return;   // exam renders via a different path
  var bytes = serializedBytes(response);
  if (bytes > MAX_ENTRY_BYTES) return;    // too big to be worth cloning later
  _entries.delete(id);
  _entries.set(id, { response: response, sig: sig != null ? sig : signature(response), at: Date.now() });
  while (_entries.size > MAX_ENTRIES) {
    var oldest = _entries.keys().next().value;
    _entries.delete(oldest);
  }
}

export function invalidate(id) {
  if (id != null) {
    _entries.delete(id);
    _inflightPrefetches.delete(id);
  }
}

/**
 * Prefetch a session in the background (e.g. on pointerenter / touchstart).
 * De-duplicates concurrent in-flight requests and avoids re-fetching cached entries.
 */
export function prefetch(id) {
  if (!id || typeof id !== 'string') return Promise.resolve(null);
  if (has(id)) {
    var cached = lookup(id);
    return Promise.resolve(cached ? cached.response : null);
  }
  if (_inflightPrefetches.has(id)) {
    return _inflightPrefetches.get(id);
  }

  var p = Promise.resolve().then(function () {
    if (typeof apiFetch === 'function') {
      return apiFetch('/api/sessions/' + encodeURIComponent(id));
    }
    return null;
  }).then(function (s) {
    _inflightPrefetches.delete(id);
    if (s && typeof s === 'object') {
      store(id, s);
    }
    return s;
  }).catch(function () {
    _inflightPrefetches.delete(id);
    return null;
  });

  _inflightPrefetches.set(id, p);
  return p;
}

export function getInflight(id) {
  return _inflightPrefetches.get(id) || null;
}

/**
 * Preload the top-N recent sessions during browser idle time so switching is 0ms.
 */
export function idleWarmup(sessionIds) {
  if (!Array.isArray(sessionIds) || !sessionIds.length) return;
  var queue = sessionIds.filter(function (id) { return id && !has(id); }).slice(0, 3);
  if (!queue.length) return;

  var step = function () {
    if (!queue.length) return;
    var nextId = queue.shift();
    prefetch(nextId).then(function () {
      if (queue.length) {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(step, { timeout: 3000 });
        } else {
          setTimeout(step, 300);
        }
      }
    });
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(step, { timeout: 3000 });
  } else {
    setTimeout(step, 300);
  }
}

/* Session-level scalars a save can move. Messages are handled separately
   because they arrive as a delta; these come back whole on the save
   response. Kept as a list so the merge is explicit and testable rather than
   a blind Object.assign over the response. */
var SCALAR_KEYS = [
  'id', 'title', 'topic', 'mode', 'kind', 'phase', 'totalQ', 'projectId',
  'pinned', 'archivedAt', 'examData', 'kbNodes', 'mistakes', 'teachingPlan',
  'boundariesHistory', 'mistakeFilter', 'branchedFrom', 'currentNode',
  'teachingStage', 'currentExampleIdx', 'practiceAttempts', 'practicePhase',
  'streamingText', 'streamingReasoning', 'createdAt', 'updatedAt', 'userId',
];

/**
 * Fold a completed save back into the cached detail response instead of
 * dropping it.
 *
 * P_cache-foldsave — the cache used to be invalidated on EVERY save, so the
 * one session most likely to be revisited — the one the user just chatted in
 * — was precisely the one that could never hit it. The save already computes
 * the exact set of message rows that moved (the same delta that made the
 * server correct, see saveDelta.js), so applying that delta to the cached copy
 * leaves it correct rather than stale.
 *
 * Anything this gets wrong is self-correcting: loadSession() reconciles every
 * hit against a live fetch and re-paints when the signature differs, so a bad
 * fold costs one extra paint, never a wrong final state.
 *
 * @param {string} id         session id the save landed under
 * @param {object} saved      the POST response (scalars)
 * @param {Array}  rows       the message delta that was acknowledged
 */
export function foldSave(id, saved, rows) {
  if (id == null) return;
  var e = _entries.get(id);
  if (!e) return;

  var response = e.response;
  var next = {};
  /* Start from the cached copy, then overlay only the scalars the save
     response actually carried. The save handler deliberately drops the big
     JSONB blobs from its reply, so anything it omits must keep the value the
     cached detail already had — a blind replace would blank kbNodes etc. */
  for (var i = 0; i < SCALAR_KEYS.length; i++) {
    var key = SCALAR_KEYS[i];
    if (Object.prototype.hasOwnProperty.call(response, key)) next[key] = response[key];
  }
  if (saved && typeof saved === 'object') {
    for (var s = 0; s < SCALAR_KEYS.length; s++) {
      var sk = SCALAR_KEYS[s];
      if (saved[sk] !== undefined) next[sk] = saved[sk];
    }
  }

  if (Array.isArray(rows) && rows.length) {
    var msgs = Array.isArray(response.messages) ? response.messages.slice() : [];
    var byClient = Object.create(null);
    for (var m = 0; m < msgs.length; m++) {
      var ck = msgs[m] && (msgs[m].clientId || msgs[m].id);
      if (ck) byClient[ck] = m;
    }
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (!row) continue;
      var match = byClient[row.clientId] != null ? byClient[row.clientId]
        : (byClient[row.id] != null ? byClient[row.id] : -1);
      if (match >= 0) {
        /* Keep the server's row id — the cache is keyed by it, and the
           client's copy may not know it yet. */
        var merged = Object.assign({}, msgs[match], row);
        merged.id = msgs[match].id;
        msgs[match] = merged;
      } else {
        msgs.push(row);
        var nk = row.clientId || row.id;
        if (nk) byClient[nk] = msgs.length - 1;
      }
    }
    next.messages = msgs;
  } else {
    next.messages = response.messages;
  }

  e.response = next;
  e.sig = signature(next);
  e.at = Date.now();
  /* Refresh LRU rank: this entry is the freshest copy we hold. */
  _entries.delete(id);
  _entries.set(id, e);
}

/** True when a live entry was fetched too recently to be worth re-checking. */
export function isFresh(entry) {
  return !!entry && (Date.now() - entry.at) < REVALIDATE_AFTER_MS;
}

export function has(id) {
  var e = _entries.get(id);
  return !!e && (Date.now() - e.at <= MAX_AGE_MS);
}

/* Test seams. */
export function _reset() {
  _entries.clear();
  _inflightPrefetches.clear();
}
export function _size() { return _entries.size; }
export const limits = { MAX_ENTRIES: MAX_ENTRIES, MAX_ENTRY_BYTES: MAX_ENTRY_BYTES, MAX_AGE_MS: MAX_AGE_MS, REVALIDATE_AFTER_MS: REVALIDATE_AFTER_MS };

export const detailCache = {
  signature: signature,
  lookup: lookup,
  store: store,
  invalidate: invalidate,
  prefetch: prefetch,
  getInflight: getInflight,
  idleWarmup: idleWarmup,
  foldSave: foldSave,
  has: has,
  isFresh: isFresh,
  _reset: _reset,
  _size: _size,
  limits: limits,
};
