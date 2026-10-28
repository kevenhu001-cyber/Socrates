/* session/detailCache.ts — P2 stale-while-revalidate session-detail cache.
 *
 * apiFetch forces `cb=<ts>` + `no-store` on every GET (util/api.ts), so
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
 * Exported as a plain object (not a class) to match the other session/*.ts
 * modules and to keep the unit test free of import-order concerns.
 */

import { apiFetch } from '../util/api.ts';

const MAX_ENTRIES = 8;
const MAX_ENTRY_BYTES = 3_000_000;   // 3 MB serialized cap per session
const MAX_AGE_MS = 600_000;          // 10 min: after this a hit is treated as a miss

/** A message row inside a cached detail response. */
export interface CachedMessage {
  id?: string | null;
  clientId?: string | null;
  html?: string | null;
  rawText?: string | null;
  reasoningContent?: string | null;
  /* The cache never interprets attachments — it only measures their string
     fields — so the row type stays structural rather than pinning one
     producer's attachment shape. */
  attachments?: unknown[] | null;
  toolCalls?: unknown[] | null;
  [key: string]: unknown;
}

/** GET /api/sessions/:id, as far as the cache and the fold read it. */
export interface CachedDetailResponse {
  id?: string;
  kind?: string | null;
  title?: string | null;
  topic?: string | null;
  phase?: string | null;
  streamingText?: string | null;
  messages?: CachedMessage[] | null;
  [key: string]: unknown;
}

export interface CacheEntry {
  response: CachedDetailResponse;
  sig: string;
  at: number;
}

/* id -> { response, sig, at } ; Map preserves insertion order = LRU. */
const _entries = new Map<string, CacheEntry>();
const _inflightPrefetches = new Map<string, Promise<CachedDetailResponse | null>>();

/* A cached entry fetched this recently is not re-fetched in the background:
   the same tab just read it, and every local write path (save / delete /
   archive) invalidates it. Rapid back-and-forth switching used to pay one
   full detail GET + JSON.parse per click. */
const REVALIDATE_AFTER_MS = 30_000;

/* Size estimate for the cap. This used to JSON.stringify the whole response
   on every store — a multi-hundred-KB serialisation on each switch just to
   read `.length`. The message bodies dominate the payload, so summing their
   string fields (plus a per-row allowance for keys and small fields) is
   within a few percent and costs nothing. */
function attachmentBytes(attachments: CachedMessage['attachments']): number {
  if (!Array.isArray(attachments)) return 0;
  let total = 0;
  for (const attachment of attachments) {
    const item = attachment as { dataUrl?: string | null; text?: string | null } | null | undefined;
    if (item) total += 128 + (item.dataUrl ? item.dataUrl.length : 0) + (item.text ? item.text.length : 0);
  }
  return total;
}

function toolCallBytes(toolCalls: CachedMessage['toolCalls']): number {
  if (!Array.isArray(toolCalls)) return 0;
  try { return JSON.stringify(toolCalls).length; } catch { return Infinity; }
}

function messageBytes(message: CachedMessage | null | undefined): number {
  if (!message) return 0;
  return 256 + (message.html ? message.html.length : 0) + (message.rawText ? message.rawText.length : 0)
    + (message.reasoningContent ? message.reasoningContent.length : 0)
    + attachmentBytes(message.attachments)
    + toolCallBytes(message.toolCalls);
}

function serializedBytes(response: CachedDetailResponse): number {
  const messages = Array.isArray(response.messages) ? response.messages : [];
  return messages.reduce((total, message) => total + messageBytes(message), 2048);
}

/**
 * Cheap stable fingerprint of the fields that change what loadSession paints.
 * Deliberately excludes updatedAt (bumps on every save even when nothing the
 * renderer reads moved) and includes a sum of html lengths so an in-place edit
 * that keeps the same message id still trips a re-paint.
 */
export function signature(s: CachedDetailResponse | null | undefined): string {
  if (!s || typeof s !== 'object') return '';
  const msgs = Array.isArray(s.messages) ? s.messages : [];
  let ids = '';
  let htmlLen = 0;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i] || {};
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
export function lookup(id: string): CacheEntry | null {
  const e = _entries.get(id);
  if (!e) return null;
  if (Date.now() - e.at > MAX_AGE_MS) { _entries.delete(id); return null; }
  _entries.delete(id); _entries.set(id, e);
  return e;
}

/** Remember a freshly-fetched response for `id` (subject to the size caps). */
export function store(id: string, response: CachedDetailResponse, sig?: string | null): void {
  if (!id || !response || typeof response !== 'object') return;
  if (response.kind === 'exam') return;   // exam renders via a different path
  const bytes = serializedBytes(response);
  if (bytes > MAX_ENTRY_BYTES) return;    // too big to be worth cloning later
  _entries.delete(id);
  _entries.set(id, { response, sig: sig != null ? sig : signature(response), at: Date.now() });
  while (_entries.size > MAX_ENTRIES) {
    const oldest = _entries.keys().next().value;
    if (oldest === undefined) break;
    _entries.delete(oldest);
  }
}

export function invalidate(id: string | null | undefined): void {
  if (id != null) {
    _entries.delete(id);
    _inflightPrefetches.delete(id);
    warmupIds.delete(id);
    for (let index = prefetchQueue.length - 1; index >= 0; index--) {
      if (prefetchQueue[index].id === id) prefetchQueue.splice(index, 1)[0].resolve(null);
    }
    for (const task of activePrefetches) {
      if (task.id === id) { task.controller.abort(); task.resolve(null); }
    }
  }
}

type PrefetchTask = {
  id: string;
  promise: Promise<CachedDetailResponse | null>;
  resolve: (response: CachedDetailResponse | null) => void;
  controller: AbortController;
  generation: number;
};
const prefetchQueue: PrefetchTask[] = [];
const activePrefetches = new Set<PrefetchTask>();
const MAX_PREFETCHES = 2;
let generation = 0;
let warmupHandle: ReturnType<typeof setTimeout> | number | null = null;
let warmupUsesIdle = false;
const warmupIds = new Set<string>();

function cancelWarmup(): void {
  if (warmupHandle !== null) {
    if (warmupUsesIdle && typeof cancelIdleCallback === 'function') cancelIdleCallback(warmupHandle as number);
    else clearTimeout(warmupHandle);
  }
  warmupHandle = null;
  warmupIds.clear();
}

function pumpPrefetches(): void {
  while (activePrefetches.size < MAX_PREFETCHES && prefetchQueue.length) {
    const task = prefetchQueue.shift()!;
    activePrefetches.add(task);
    void apiFetch<CachedDetailResponse>('/api/sessions/' + encodeURIComponent(task.id), { signal: task.controller.signal })
      .then((response) => {
        if (task.generation !== generation || task.controller.signal.aborted) return null;
        if (response && typeof response === 'object') store(task.id, response);
        return response;
      }).catch(() => null).then((response) => {
        task.resolve(response);
        activePrefetches.delete(task);
        if (_inflightPrefetches.get(task.id) === task.promise) _inflightPrefetches.delete(task.id);
        pumpPrefetches();
      });
  }
}

/** Background details share one bounded queue, including hover and idle work. */
export function prefetch(id: string | null | undefined): Promise<CachedDetailResponse | null> {
  if (!id || typeof id !== 'string') return Promise.resolve(null);
  if (has(id)) return Promise.resolve(lookup(id)?.response ?? null);
  const inflight = _inflightPrefetches.get(id);
  if (inflight) return inflight;
  let resolve!: PrefetchTask['resolve'];
  const promise = new Promise<CachedDetailResponse | null>((done) => { resolve = done; });
  _inflightPrefetches.set(id, promise);
  // Hovering a long list must not retain an unbounded backlog of details.
  if (prefetchQueue.length >= MAX_ENTRIES) {
    const dropped = prefetchQueue.shift()!;
    _inflightPrefetches.delete(dropped.id);
    dropped.resolve(null);
  }
  prefetchQueue.push({ id, promise, resolve, controller: new AbortController(), generation });
  pumpPrefetches();
  return promise;
}

export function getInflight(id: string): Promise<CachedDetailResponse | null> | null {
  return _inflightPrefetches.get(id) || null;
}

/** Repeated list publications merge into one cancellable idle job. */
export function idleWarmup(sessionIds: ReadonlyArray<string | null | undefined>): void {
  for (const id of sessionIds.slice(0, 3)) {
    if (warmupIds.size >= 3) break;
    if (id && !has(id)) warmupIds.add(id);
  }
  if (!warmupIds.size || warmupHandle !== null) return;
  const step = () => {
    warmupHandle = null;
    const ids = [...warmupIds].slice(0, 3);
    warmupIds.clear();
    ids.forEach((id) => { void prefetch(id); });
  };
  warmupUsesIdle = typeof requestIdleCallback === 'function';
  warmupHandle = warmupUsesIdle ? requestIdleCallback(step, { timeout: 3000 }) : setTimeout(step, 300);
}

/** Account boundary: cancel work AND prevent late responses repopulating cache. */
export function clear(): void {
  generation += 1;
  cancelWarmup();
  for (const task of [...prefetchQueue, ...activePrefetches]) {
    task.controller.abort();
    task.resolve(null);
  }
  prefetchQueue.length = 0;
  activePrefetches.clear();
  _inflightPrefetches.clear();
  _entries.clear();
}

/* Session-level scalars a save can move. Messages are handled separately
   because they arrive as a delta; these come back whole on the save
   response. Kept as a list so the merge is explicit and testable rather than
   a blind Object.assign over the response. */
const SCALAR_KEYS = [
  'id', 'title', 'topic', 'mode', 'kind', 'phase', 'totalQ', 'projectId',
  'pinned', 'archivedAt', 'examData', 'kbNodes', 'mistakes', 'teachingPlan',
  'boundariesHistory', 'mistakeFilter', 'branchedFrom', 'currentNode',
  'teachingStage', 'currentExampleIdx', 'practiceAttempts', 'practicePhase',
  'streamingText', 'streamingReasoning', 'createdAt', 'updatedAt', 'userId',
];

function copySavedScalars(
  response: CachedDetailResponse,
  saved: Record<string, unknown> | null | undefined,
): CachedDetailResponse {
  const next: CachedDetailResponse = {};
  for (const key of SCALAR_KEYS) {
    if (Object.prototype.hasOwnProperty.call(response, key)) next[key] = response[key];
  }
  if (saved && typeof saved === 'object') {
    for (const key of SCALAR_KEYS) {
      if (saved[key] !== undefined) next[key] = saved[key];
    }
  }
  return next;
}

function indexMessages(messages: CachedMessage[]): Record<string, number> {
  const indexByClient: Record<string, number> = Object.create(null);
  for (let index = 0; index < messages.length; index++) {
    const row = messages[index];
    const key = row && (row.clientId || row.id);
    if (key) indexByClient[key] = index;
  }
  return indexByClient;
}

function mergeSavedMessage(
  messages: CachedMessage[],
  indexByClient: Record<string, number>,
  row: CachedMessage | null | undefined,
): void {
  if (!row) return;
  const byClientId = row.clientId ? indexByClient[row.clientId] : undefined;
  const byRowId = row.id ? indexByClient[row.id] : undefined;
  const match = byClientId != null ? byClientId : (byRowId != null ? byRowId : -1);
  if (match >= 0) {
    /* Keep the server's row id — the cache is keyed by it, and the
       client's copy may not know it yet. */
    const merged = Object.assign({}, messages[match], row);
    merged.id = messages[match].id;
    messages[match] = merged;
    return;
  }
  messages.push(row);
  const key = row.clientId || row.id;
  if (key) indexByClient[key] = messages.length - 1;
}

function foldSavedRows(
  currentRows: CachedMessage[] | null | undefined,
  savedRows: CachedMessage[] | null | undefined,
): CachedMessage[] | null | undefined {
  if (!Array.isArray(savedRows) || !savedRows.length) return currentRows;
  const messages = Array.isArray(currentRows) ? currentRows.slice() : [];
  const indexByClient = indexMessages(messages);
  for (const row of savedRows) mergeSavedMessage(messages, indexByClient, row);
  return messages;
}

/**
 * Fold a completed save back into the cached detail response instead of
 * dropping it.
 *
 * P_cache-foldsave — the cache used to be invalidated on EVERY save, so the
 * one session most likely to be revisited — the one the user just chatted in
 * — was precisely the one that could never hit it. The save already computes
 * the exact set of message rows that moved (the same delta that made the
 * server correct, see saveDelta.ts), so applying that delta to the cached copy
 * leaves it correct rather than stale.
 *
 * Anything this gets wrong is self-correcting: loadSession() reconciles every
 * hit against a live fetch and re-paints when the signature differs, so a bad
 * fold costs one extra paint, never a wrong final state.
 *
 * @param id    session id the save landed under
 * @param saved the POST response (scalars)
 * @param rows  the message delta that was acknowledged
 */
export function foldSave(
  id: string | null | undefined,
  saved: Record<string, unknown> | null | undefined,
  rows: CachedMessage[] | null | undefined,
): void {
  if (id == null) return;
  const e = _entries.get(id);
  if (!e) return;

  const response = e.response;
  /* Start from the cached copy, then overlay only the scalars the save
     response actually carried. The save handler deliberately drops the big
     JSONB blobs from its reply, so anything it omits must keep the value the
     cached detail already had — a blind replace would blank kbNodes etc. */
  const next = copySavedScalars(response, saved);
  next.messages = foldSavedRows(response.messages, rows);

  e.response = next;
  e.sig = signature(next);
  e.at = Date.now();
  /* Refresh LRU rank: this entry is the freshest copy we hold. */
  _entries.delete(id);
  _entries.set(id, e);
}

/** True when a live entry was fetched too recently to be worth re-checking. */
export function isFresh(entry: CacheEntry | null | undefined): boolean {
  return !!entry && (Date.now() - entry.at) < REVALIDATE_AFTER_MS;
}

export function has(id: string): boolean {
  const e = _entries.get(id);
  return !!e && (Date.now() - e.at <= MAX_AGE_MS);
}

/* Test seams. */
export function _reset(): void {
  clear();
}
export function _size(): number { return _entries.size; }
export const limits = { MAX_ENTRIES, MAX_ENTRY_BYTES, MAX_AGE_MS, REVALIDATE_AFTER_MS };

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
  clear: clear,
  _reset: _reset,
  _size: _size,
  limits: limits,
};
