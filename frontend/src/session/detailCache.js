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

var MAX_ENTRIES = 8;
var MAX_ENTRY_BYTES = 3_000_000;   // 3 MB serialized cap per session
var MAX_AGE_MS = 600_000;          // 10 min: after this a hit is treated as a miss

/* id -> { response, sig, at } ; Map preserves insertion order = LRU. */
var _entries = new Map();

function serializedBytes(response) {
  try { return JSON.stringify(response).length; } catch (_) { return Infinity; }
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
  if (id != null) _entries.delete(id);
}

export function has(id) {
  var e = _entries.get(id);
  return !!e && (Date.now() - e.at <= MAX_AGE_MS);
}

/* Test seams. */
export function _reset() { _entries.clear(); }
export function _size() { return _entries.size; }
export const limits = { MAX_ENTRIES: MAX_ENTRIES, MAX_ENTRY_BYTES: MAX_ENTRY_BYTES, MAX_AGE_MS: MAX_AGE_MS };

export const detailCache = {
  signature: signature,
  lookup: lookup,
  store: store,
  invalidate: invalidate,
  has: has,
  _reset: _reset,
  _size: _size,
  limits: limits,
};
