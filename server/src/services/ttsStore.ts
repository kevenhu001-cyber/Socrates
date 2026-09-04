/**
 * ttsStore — durable per-message TTS cache (LobeHub-alignment M4 follow-up).
 *
 * Persists the synthesized audio bytes for each assistant message so
 * the first read-aloud of a reloaded session replays the cached bytes
 * for free, and a second read of the same (message, voice, format,
 * lang) tuple never re-bills the upstream provider.
 *
 * Two-tier cache: the existing process-wide `TtsCache` in
 * `ttsCache.ts` stays as the fast in-memory tier; this table is the
 * durable tier that survives a process restart.
 *
 * Ownership: a `messageId` is only authoritative when the caller's
 * session owns the message. The helper `verifyOwnership` enforces
 * this on every read and every write so a forged id cannot read or
 * persist another user's audio. Failed ownership checks silently
 * fall through (return null / no insert), so the route's in-memory
 * tier still serves same-process repeats without surfacing the
 * authorization error to the client.
 */
import { createHash } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { ttsResults, messages, sessions } from '../db/schema.js';

/* Pure helper — sha256 of the trimmed text the read-aloud path feeds
   to /api/tts. Re-computed in PATCH /api/messages to drop stale rows
   on edit. Trimming matches the route: `text.trim().slice(0, 20_000)`. */
export function ttsTextHash(text: string): string {
  return createHash('sha256').update(String(text || '').trim()).digest('hex');
}

export interface TtsStoredRow {
  audio: Buffer;
  contentType: string;
  textHash: string;
  byteSize: number;
}

/* Caller must own the message (session.user_id == userId). Returns
   false for missing rows so the route silently falls through to the
   in-memory tier instead of leaking an auth error to the client. */
async function verifyOwnership(messageId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(sessions, eq(sessions.id, messages.sessionId))
    .where(and(eq(messages.id, messageId), eq(sessions.userId, userId)))
    .limit(1);
  return !!row;
}

/* Look up a cached audio row for the given (message, voice, format,
   lang) tuple. Returns null when the message is not owned by the
   caller, when no row exists, or when the persisted `text_hash` does
   not match the current text (stale-on-edit detection). */
export async function lookupTtsResult(
  messageId: string,
  userId: string,
  voice: string,
  format: string,
  lang: string,
  textHash: string,
): Promise<TtsStoredRow | null> {
  if (!await verifyOwnership(messageId, userId)) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(ttsResults)
    .where(and(
      eq(ttsResults.messageId, messageId),
      eq(ttsResults.voice, voice),
      eq(ttsResults.format, format),
      eq(ttsResults.lang, lang),
    ))
    .limit(1);
  if (!row) return null;
  if (row.textHash !== textHash) return null;
  return {
    audio: row.audio,
    contentType: row.contentType,
    textHash: row.textHash,
    byteSize: row.byteSize,
  };
}

/* Persist (or replace) a synthesized audio row for the given tuple.
   Silently no-ops when the caller does not own the message. The
   unique index on (message_id, voice, format, lang) is the upsert
   target — calling twice with the same shape replaces the row. */
export async function saveTtsResult(
  messageId: string,
  userId: string,
  voice: string,
  format: string,
  lang: string,
  textHash: string,
  audio: Buffer,
  contentType: string,
): Promise<void> {
  if (!await verifyOwnership(messageId, userId)) return;
  const db = getDb();
  await db.insert(ttsResults).values({
    messageId,
    voice,
    format,
    lang,
    textHash,
    audio,
    contentType,
    byteSize: audio.length,
  }).onConflictDoUpdate({
    target: [
      ttsResults.messageId,
      ttsResults.voice,
      ttsResults.format,
      ttsResults.lang,
    ],
    set: {
      textHash,
      audio,
      contentType,
      byteSize: audio.length,
      createdAt: new Date(),
    },
  });
}

/* Drop every cached row for the given message whose `text_hash` no
   longer matches the current text. Called from PATCH /api/messages
   after the new content is sanitized, so a same-shape edit (e.g.
   attachment-only) keeps its audio and a text edit invalidates
   only the stale rows. DELETE /api/messages does not need this
   helper — the FK cascade drops the rows automatically. */
export async function invalidateForMessage(
  messageId: string,
  currentTextHash: string,
): Promise<void> {
  const db = getDb();
  await db.delete(ttsResults)
    .where(and(
      eq(ttsResults.messageId, messageId),
      ne(ttsResults.textHash, currentTextHash),
    ));
}
