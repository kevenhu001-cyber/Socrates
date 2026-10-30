/* session/saveDelta.ts — incremental session-save payload builder.
 *
 * Extracted from session/persistence.js for the same reason
 * session/beacon.ts was: the logic is pure data-in / data-out, and
 * keeping it out of persistence.js (which installs window listeners at
 * import time) makes it unit-testable without DOM globals.
 *
 * Why it exists
 * -------------
 * The chat client re-POSTs the whole transcript on every save, so a
 * 240-message conversation shipped ~1 MB per save, several times per
 * turn. The server now upserts only the rows whose text actually moved
 * (see P_upsert-dirty in server/src/routes/sessions.ts), which means most
 * of that body was bytes the server had to parse and then discard.
 *
 * This module reduces the body to the rows the server is not already
 * known to hold, tracked by a per-session watermark of
 * clientId → fingerprint.
 *
 * Deletions deliberately do NOT travel through this payload. The save
 * endpoint is a pure upsert by contract; the client already handles
 * removal out-of-band — `deleteUserMessage` fires
 * `DELETE /api/messages/<id>` and edit/regenerate fires
 * `PATCH /api/messages/<id>?discardFollowing=true` (chat/editBranch.ts).
 * A delta therefore cannot strand an orphan that the full payload would
 * have cleaned up, because the full payload never did.
 *
 * The watermark must be advanced ONLY after the server acknowledges the
 * batch — see `commitSynced` in persistence.js. Advancing it earlier
 * would silently drop rows on a failed save.
 */

/** The message fields the fingerprint covers. */
export interface MessageLike {
  clientId?: string | null;
  id?: string | null;
  rawText?: string | null;
  html?: string | null;
  type?: string | null;
  toolCalls?: unknown[];
  [key: string]: unknown;
}

export interface FingerprintCache {
  of(message: MessageLike | null | undefined): string;
}

interface CacheEntry {
  raw: string;
  type: string;
  htmlLen: number;
  tools: number;
  calls: unknown[] | null;
  fp: string;
}

/* FNV-1a. ~0.5 ms per 1 MB, which is the same order as the
 * JSON.stringify the full payload needed anyway, and far stronger than
 * the length-only compare the old whole-payload signature relied on. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function toolCallsFingerprint(value: unknown): string {
  const calls = Array.isArray(value) ? value : [];
  let serialized: string;
  try { serialized = JSON.stringify(calls); } catch { serialized = String(calls); }
  return serialized.length + ':' + fnv1a(serialized).toString(36);
}

function sameToolCalls(previous: unknown, current: unknown): boolean {
  if (previous === current) return true;
  if (!Array.isArray(previous) || !Array.isArray(current) || previous.length !== current.length) return false;
  for (let i = 0; i < previous.length; i++) if (previous[i] !== current[i]) return false;
  return true;
}

function matchesFingerprintEntry(
  entry: CacheEntry | undefined,
  raw: string,
  type: string,
  htmlLen: number,
  tools: number,
  calls: unknown[] | null,
): entry is CacheEntry {
  return !!entry && entry.raw === raw && entry.type === type && entry.htmlLen === htmlLen
    && entry.tools === tools && sameToolCalls(entry.calls, calls);
}

export function messageFingerprint(m: MessageLike | null | undefined): string {
  if (!m) return '';
  const clientId = m.clientId || m.id || '';
  const raw = m.rawText || '';
  const calls = Array.isArray(m.toolCalls) ? m.toolCalls : [];
  return clientId + ':' + raw.length + ':' + fnv1a(raw).toString(36)
    + ':' + (m.html || '').length + ':' + (m.type || '')
    + ':' + calls.length + ':' + toolCallsFingerprint(calls);
}

/** Fingerprint an arbitrary tutor-state value (teachingPlan, boundariesHistory). */
export function stateFingerprint(v: unknown): string {
  let s: string;
  try { s = JSON.stringify(v == null ? null : v); } catch { s = String(v == null ? '' : v); }
  return s.length + ':' + fnv1a(s).toString(36);
}

/**
 * Create the memo that makes per-save fingerprinting O(changed) rather
 * than O(transcript). Keyed by clientId, and invalidated by string
 * identity: message entries are immutable in the reducer, so an
 * untouched message reuses its previous hash after a single pointer
 * compare.
 */
export function createFingerprintCache(cap?: number): FingerprintCache {
  const cache = new Map<string, CacheEntry>();
  const max = cap || 4000;
  return {
    of: function (m) {
      if (!m) return '';
      const clientId = m.clientId || m.id || '';
      if (!clientId) return messageFingerprint(m);
      const raw = m.rawText || '';
      const type = m.type || '';
      const htmlLen = (m.html || '').length;
      const calls = Array.isArray(m.toolCalls) ? m.toolCalls : null;
      const tools = calls ? calls.length : 0;
      /* Every field the fingerprint covers must also be part of the
         memo comparison, not just rawText. A message that gains its
         rendered html, or flips from a streaming placeholder to a
         finalized assistant row, keeps the same rawText — and V8 hands
         back the SAME string reference, so a rawText-only check would
         happily return the stale fingerprint and silently drop the
         update. Tool-call entries are replaced on result updates; comparing
         member identities also covers shallow-copied arrays in save snapshots. */
      const hit = cache.get(clientId);
      if (matchesFingerprintEntry(hit, raw, type, htmlLen, tools, calls)) {
        return hit.fp;
      }
      const toolsSig = toolCallsFingerprint(calls);
      const fp = clientId + ':' + raw.length + ':' + fnv1a(raw).toString(36)
        + ':' + htmlLen + ':' + type + ':' + tools + ':' + toolsSig;
      if (cache.size > max) cache.clear();
      cache.set(clientId, { raw, type, htmlLen, tools, calls, fp });
      return fp;
    },
  };
}

/**
 * Mark every message in a freshly loaded session as already-held by the
 * server, so the first save after a switch is a delta instead of a full
 * re-upload. Rows without a stable id are skipped — they can never be
 * matched and are always sent.
 */
export function seedSynced(synced: Map<string, string>, messages: unknown, fingerprints: FingerprintCache): void {
  synced.clear();
  if (!Array.isArray(messages)) return;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as MessageLike | null | undefined;
    if (!m) continue;
    const clientId = m.clientId || m.id;
    if (!clientId) continue;
    synced.set(clientId, fingerprints.of(m));
  }
}

/** The rows the server is not already known to hold, in payload shape. */
export function messageDelta(
  synced: Map<string, string>,
  messages: unknown,
  fingerprints: FingerprintCache,
): MessageLike[] {
  const all = Array.isArray(messages) ? (messages as MessageLike[]) : [];
  const delta: MessageLike[] = [];
  for (let i = 0; i < all.length; i++) {
    const m = all[i];
    /* No stable id means the row cannot be matched against the
       watermark, so it is sent every time. Correctness over size. */
    if (!m || !(m.clientId || m.id) || synced.get(m.clientId || m.id || '') !== fingerprints.of(m)) {
      delta.push(m);
    }
  }
  return delta;
}

/** A save payload: session scalars plus the message rows. */
export interface SessionPayload {
  messages?: unknown;
  topic?: string | null;
  title?: string | null;
  [key: string]: unknown;
}

/**
 * Build the request body: every session scalar, plus only the message
 * rows that moved. An empty `messages` array is safe — the server skips
 * the upsert when there is nothing to write and still persists the
 * session row itself.
 */
export function buildDeltaPayload(
  payload: SessionPayload,
  synced: Map<string, string>,
  fingerprints: FingerprintCache,
): SessionPayload {
  const out: SessionPayload = {};
  for (const k in payload) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) out[k] = payload[k];
  }
  out.messages = messageDelta(synced, payload.messages, fingerprints);
  return out;
}

/**
 * Record the acknowledged rows. Call ONLY from the POST success path:
 * a failed save must leave the watermark alone so the next attempt
 * re-sends the same rows.
 */
export function commitSynced(
  synced: Map<string, string>,
  sentMessages: unknown,
  fingerprints: FingerprintCache,
): void {
  if (!Array.isArray(sentMessages)) return;
  for (let i = 0; i < sentMessages.length; i++) {
    const m = sentMessages[i] as MessageLike | null | undefined;
    if (!m) continue;
    const clientId = m.clientId || m.id;
    if (!clientId) continue;
    synced.set(clientId, fingerprints.of(m));
  }
}
