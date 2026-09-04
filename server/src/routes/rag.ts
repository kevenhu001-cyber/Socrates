/**
 * POST /api/rag/search — session-scoped BM25 retrieval (LobeHub-alignment
 * M3 deferred).
 *
 * Body:
 *   - sessionId (uuid, required)
 *   - query     (string, required, ≤ 2 KB)
 *   - limit     (int, optional, 1..50, default 8)
 *   - minScore  (number, optional, default 0.5)
 *
 * Returns:
 *   { hits: [{ messageId, ordinal, text, score }] }
 *
 * Owner check: the helper in services/chunkIndex.ts confirms the
 * session belongs to the caller before any retrieval; a forged
 * sessionId is treated as "no session" and returns 404. The route
 * is intentionally read-only and shares the standard `requireAuth`
 * + `apiDefaultLimiter` middleware the rest of the chat surface
 * uses.
 *
 * The retrieval is in-memory BM25 over the session's full chunk
 * set. Cost is O(chunks_in_session) per query; a future work item
 * can promote this to a persisted index or pgvector + embedding
 * re-ranking without changing the wire contract.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  searchSessionChunksHybrid,
  sessionOwnedBy,
} from '../services/chunkIndex.js';
import { BadRequest, NotFound } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';

const router = Router();

const searchSchema = z.object({
  sessionId: z.string().refine(isUuid, 'sessionId must be a uuid'),
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(50).optional(),
  minScore: z.number().min(0).max(20).optional(),
});

/* P_session-chunks-embedding — the hybrid BM25 + vector re-rank is
   now the default. When the admin has not configured an active
   embedding provider, searchSessionChunksHybrid degrades to plain
   BM25 (same contract as the pre-vector endpoint), so the caller
   does not need to know which tier is active. */
router.post('/search', requireAuth, async (req, res, next) => {
  try {
    const parsed = searchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequest('Invalid search body: ' + (parsed.error.issues[0]?.message || 'validation failed'));
    }
    const { sessionId, query, limit, minScore } = parsed.data;
    if (!(await sessionOwnedBy(sessionId, req.userId!))) {
      throw new NotFound('Session not found');
    }
    const hits = await searchSessionChunksHybrid(sessionId, query, { limit, minScore });
    return res.json({
      hits: hits.map((h) => ({
        messageId: h.messageId,
        ordinal: h.ordinal,
        text: h.text,
        score: h.score,
      })),
    });
  } catch (err) { next(err); }
});

export default router;
