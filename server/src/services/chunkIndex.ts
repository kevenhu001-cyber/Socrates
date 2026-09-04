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
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { sessionChunks } from '../db/schema.js';
import {
  chunkText,
  buildRagIndex,
  searchRagIndex,
  type RagChunk,
} from './rag.js';
import { embedTexts, getActiveEmbeddingConfig } from './embedding.js';

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
   upstream; the helper only does the storage work.

   The vector enrichment is a best-effort second pass: after the
   chunk rows are written we try to embed them and update the
   `embedding` column in place. Any failure is logged and swallowed
   — the BM25 index is the contract, the embedding is bonus. The
   embedding call is skipped entirely when the admin has not
   configured an active embedding provider (getActiveEmbeddingConfig
   returns null), so the write path is cheap when the vector layer
   is off. */
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
  await db.transaction(async (tx) => {
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
  });

  /* Vector enrichment — batch the chunk texts through the embedding
     provider and update the rows in place. Capped to MAX_BATCH per
     call; if a message chunks beyond that we embed the first batch
     and leave the rest null (still valid BM25 hits). */
  try {
    const config = await getActiveEmbeddingConfig();
    if (config) {
      const batch = chunks.slice(0, 64);
      const vectors = await embedTexts(batch.map((c) => c.text));
      if (vectors && vectors.length === batch.length) {
        for (let i = 0; i < batch.length; i++) {
          await db.update(sessionChunks)
            .set({ embedding: vectors[i] })
            .where(and(
              eq(sessionChunks.messageId, messageId),
              eq(sessionChunks.ordinal, batch[i].index),
            ));
        }
      }
    }
  } catch (err) {
    console.warn(`[chunkIndex] embedding enrichment failed for ${messageId}: ${(err as Error).message}`);
  }

  return chunks;
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

/* Hybrid BM25 + cosine re-ranking.

   Step 1 (BM25 recall) — unchanged from searchSessionChunks. This
   guarantees at least the lexical hits the caller already sees.
   Step 2 (vector re-rank) — when the admin has configured an active
   embedding provider, embed the query and run a cosine-distance
   search over the session's chunks via pgvector's HNSW index. The
   vector hits are fused with the BM25 hits using Reciprocal Rank
   Fusion (RRF): for each distinct chunk id, score = Σ 1 / (k +
   rank_in_list) with k=60. RRF is robust to the two lists having
   very different score scales.

   When the vector layer is not configured (no active embedding
   provider, upstream failure, or the query embedding returned
   null), this degrades to plain BM25 — same contract as before.
   When BM25 has zero hits but the vector layer produced some, the
   vector hits carry through (the wording did not overlap but the
   semantics did — exactly the case the vector layer exists for). */
export async function searchSessionChunksHybrid(
  sessionId: string,
  query: string,
  options: { limit?: number; minScore?: number } = {},
): Promise<RagSearchHit[]> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 8));
  const bm25Hits = await searchSessionChunks(sessionId, query, { limit });

  /* Vector leg. Guarded in a try/catch so any pgvector / provider
     hiccup degrades to BM25-only. */
  try {
    const config = await getActiveEmbeddingConfig();
    if (!config) return bm25Hits;
    const [queryVector] = (await embedTexts([query])) || [];
    if (!queryVector || queryVector.length !== config.dimensions) return bm25Hits;

    const db = getDb();
    /* pgvector cosine distance: 0 = identical, 2 = opposite. We use
       the raw distance as the vector score (lower = better) and fuse
       with RRF so the two scales never have to be calibrated. */
    const vectorRows = await db
      .select({
        id: sessionChunks.id,
        messageId: sessionChunks.messageId,
        ordinal: sessionChunks.ordinal,
        text: sessionChunks.text,
        distance: sql<number>`"embedding" <=> ${JSON.stringify(queryVector)}::vector`,
      })
      .from(sessionChunks)
      .where(and(
        eq(sessionChunks.sessionId, sessionId),
        isNotNull(sessionChunks.embedding),
      ))
      .orderBy(sql`"embedding" <=> ${JSON.stringify(queryVector)}::vector`)
      .limit(limit);

    if (!vectorRows.length) return bm25Hits;

    /* RRF fusion. Each list contributes 1 / (k + rank) with k=60
       (standard RRF constant). A chunk that appears in both lists
       sums the contributions. */
    const K = 60;
    const fused = new Map<string, { chunk: IndexedChunk; score: number }>();
    bm25Hits.forEach((hit, idx) => {
      const key = `${hit.messageId}:${hit.ordinal}`;
      const cur = fused.get(key) || { chunk: hit, score: 0 };
      cur.score += 1 / (K + idx + 1);
      fused.set(key, cur);
    });
    vectorRows.forEach((row, idx) => {
      const key = `${row.messageId}:${row.ordinal}`;
      const chunk: IndexedChunk = {
        id: row.id,
        messageId: row.messageId,
        ordinal: row.ordinal,
        text: row.text,
      };
      const cur = fused.get(key) || { chunk, score: 0 };
      cur.score += 1 / (K + idx + 1);
      fused.set(key, cur);
    });
    return [...fused.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => ({ ...entry.chunk, score: entry.score }));
  } catch (err) {
    console.warn('[chunkIndex] vector re-rank failed, BM25-only:', (err as Error).message);
    return bm25Hits;
  }
}
