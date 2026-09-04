/**
 * chunkIndex — durable per-message chunk index for session-scoped
 * BM25 retrieval (LobeHub-alignment M3 deferred).
 *
 * The pure scoring core lives in services/rag.ts. This module is the
 * persistence adapter: it (1) chunks a freshly-persisted message's
 * text and writes one row per chunk into `session_chunks`, and (2)
 * loads all chunks for a session and ranks them with `searchRagIndex`
 * for a query.
 *
 * Why a separate table and not the existing `messages.content` /
 * `messages.rawText` columns? The chat surface already loads
 * message rows on every render — but the chat surface loads
 * them to *display* them, not to *search* across hundreds of them.
 * A flat table with a session_id-first index lets the search path
 * pull only the relevant text without touching the rest of the
 * message payload (content, html, toolCalls, attachments, etc.).
 *
 * Idempotency: the unique (message_id, ordinal) index means a
 * re-index of the same message replaces the existing rows. The
 * helper drops then re-inserts in one transaction so a partial
 * failure leaves either the old or the new state, never a mix.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { sessionChunks } from '../db/schema.js';
import {
  chunkText,
  buildRagIndex,
  searchRagIndex,
  type RagChunk,
} from './rag.js';

export interface IndexedChunk {
  id: string;
  messageId: string;
  ordinal: number;
  text: string;
}

export interface RagSearchHit extends IndexedChunk {
  score: number;
}

/* Chunk the message text and replace any existing chunks for the
   same message. Idempotent: re-indexing the same message yields
   the same row set. Caller is responsible for ownership checks
   upstream; the helper only does the storage work. */
export async function indexMessageChunks(
  messageId: string,
  sessionId: string,
  text: string,
): Promise<RagChunk[]> {
  const db = getDb();
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    /* Empty / whitespace-only source — drop any stale rows from a
       previous index of the same message so a search never returns
       a phantom chunk. */
    await db.delete(sessionChunks).where(eq(sessionChunks.messageId, messageId));
    return [];
  }
  return db.transaction(async (tx) => {
    await tx.delete(sessionChunks).where(eq(sessionChunks.messageId, messageId));
    await tx.insert(sessionChunks).values(
      chunks.map((c) => ({
        messageId,
        sessionId,
        ordinal: c.index,
        text: c.text,
        startOffset: c.start,
        endOffset: c.end,
      })),
    );
    return chunks;
  });
}

/* Drop every chunk for a message. The FK cascade already does
   this when a message is deleted; this helper exists for the
   rare case where the caller wants to clear without deleting. */
export async function removeMessageChunks(messageId: string): Promise<void> {
  const db = getDb();
  await db.delete(sessionChunks).where(eq(sessionChunks.messageId, messageId));
}

/* Session-scoped BM25 retrieval. Loads every chunk for the session,
   builds the index in-memory, and ranks the query. Returns the
   top-K hits with the per-hit score. The current implementation
   is O(chunks_in_session) per query; a persisted index or pgvector
   re-ranking is a future work item that does not change the wire
   contract here. */
export async function searchSessionChunks(
  sessionId: string,
  query: string,
  options: { limit?: number; minScore?: number } = {},
): Promise<RagSearchHit[]> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 8));
  const db = getDb();
  const rows = await db
    .select({
      id: sessionChunks.id,
      messageId: sessionChunks.messageId,
      ordinal: sessionChunks.ordinal,
      text: sessionChunks.text,
    })
    .from(sessionChunks)
    .where(eq(sessionChunks.sessionId, sessionId));

  if (rows.length === 0) return [];

  const index = buildRagIndex(
    rows as Array<IndexedChunk>,
    (record) => record.text,
  );
  const hits = searchRagIndex(index, query, {
    limit,
    minScore: options.minScore ?? 0.5,
  });
  return hits.map((h) => ({
    ...(h.record as IndexedChunk),
    score: h.score,
  }));
}

/* Pure owner-check helper for the /api/rag/search route. Returns
   true when the caller owns the session. A forged sessionId is
   rejected before any retrieval. The join is cheap (PK + FK) and
   the call only runs on user-initiated search. */
export async function sessionOwnedBy(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const { sessions } = await import('../db/schema.js');
  const db = getDb();
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);
  return !!row;
}
