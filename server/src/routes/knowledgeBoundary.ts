import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { BadRequest } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';

const VALID_STATUSES = new Set(['fuzzy', 'internalized', 'blank']);

const router = Router();

router.use(requireAuth);

const UpdateKnowledgeNodeSchema = z.object({
  sessionId: z.string().uuid(),
  nodeIndex: z.number().int().nonnegative(),
  confidenceScore: z.number().int().min(0).max(5).optional(),
  userNote: z.string().max(20000).optional(),
});

/* ─── Aggregate kbNodes across sessions for the current user ───
 * kbNodes is a JSONB array on each session row. We pull the rows
 * with Drizzle, then flatten / filter in JS — the array is small
 * (capped at a few thousand nodes per session) so client-side
 * aggregation is cheap and avoids fiddly JSONB SQL. */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { status, sessionId } = req.query;

    if (status !== undefined && !VALID_STATUSES.has(String(status))) {
      throw new BadRequest('status must be one of: fuzzy, internalized, blank');
    }
    if (sessionId !== undefined && !isUuid(String(sessionId))) {
      throw new BadRequest('sessionId must be a valid uuid');
    }

    const conditions = [eq(sessions.userId, req.userId!)];
    if (sessionId) conditions.push(eq(sessions.id, String(sessionId)));

    const rows = await db.select({
      id: sessions.id,
      title: sessions.title,
      kbNodes: sessions.kbNodes,
    })
      .from(sessions)
      .where(and(...conditions));

    const items = [];
    const summary: Record<string, number> = { total: 0, fuzzy: 0, internalized: 0, blank: 0 };

    for (const row of rows) {
      const nodes = Array.isArray(row.kbNodes) ? row.kbNodes : [];
      for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
        const node = nodes[nodeIndex];
        if (!node || typeof node !== 'object') continue;
        const nodeStatus = typeof node.status === 'string' ? node.status : 'blank';
        const nodeName = typeof node.name === 'string' ? node.name : (typeof node.nodeName === 'string' ? node.nodeName : null);
        const entry = {
          nodeName,
          status: nodeStatus,
          sessionId: row.id,
          sessionTitle: row.title || null,
          nodeIndex,
          questions: typeof node.questions === 'number' ? node.questions : 0,
          verifiedCount: typeof node.verifiedCount === 'number' ? node.verifiedCount : 0,
          confidenceScore: typeof node.confidence_score === 'number'
            ? Math.max(0, Math.min(5, node.confidence_score))
            : 0,
          systemNote: typeof node.system_note === 'string' ? node.system_note : null,
          userNote: typeof node.user_note === 'string' ? node.user_note : null,
          history: Array.isArray(node.history) ? node.history.slice(-30) : [],
        };
        summary.total += 1;
        if (summary[nodeStatus] !== undefined) summary[nodeStatus] += 1;
        if (status && nodeStatus !== String(status)) continue;
        items.push(entry);
      }
    }

    return res.json({ items, summary });
  } catch (err) { next(err); }
});

/* ─── Update one knowledge node in its owning tutor session ─── */
router.patch('/node', async (req, res, next) => {
  try {
    const parsed = UpdateKnowledgeNodeSchema.parse(req.body);
    const db = getDb();
    const [session] = await db.select({
      id: sessions.id,
      title: sessions.title,
      kbNodes: sessions.kbNodes,
    })
      .from(sessions)
      .where(and(eq(sessions.id, parsed.sessionId), eq(sessions.userId, req.userId!)))
      .limit(1);

    if (!session) throw new BadRequest('Session not found');
    const nodes = Array.isArray(session.kbNodes) ? session.kbNodes.slice() : [];
    if (parsed.nodeIndex >= nodes.length) throw new BadRequest('Knowledge node index is out of range');
    const current = nodes[parsed.nodeIndex];
    if (!current || typeof current !== 'object') throw new BadRequest('Knowledge node is invalid');

    const updated = { ...current } as Record<string, unknown>;
    if (parsed.confidenceScore !== undefined) updated.confidence_score = parsed.confidenceScore;
    if (parsed.userNote !== undefined) updated.user_note = parsed.userNote;
    nodes[parsed.nodeIndex] = updated;

    await db.update(sessions)
      .set({ kbNodes: nodes, updatedAt: new Date() })
      .where(and(eq(sessions.id, parsed.sessionId), eq(sessions.userId, req.userId!)));

    return res.json({
      nodeName: typeof updated.name === 'string'
        ? updated.name
        : (typeof updated.nodeName === 'string' ? updated.nodeName : null),
      status: typeof updated.status === 'string' ? updated.status : 'blank',
      sessionId: session.id,
      sessionTitle: session.title || null,
      nodeIndex: parsed.nodeIndex,
      questions: typeof updated.questions === 'number' ? updated.questions : 0,
      verifiedCount: typeof updated.verifiedCount === 'number' ? updated.verifiedCount : 0,
      confidenceScore: typeof updated.confidence_score === 'number' ? updated.confidence_score : 0,
      systemNote: typeof updated.system_note === 'string' ? updated.system_note : null,
      userNote: typeof updated.user_note === 'string' ? updated.user_note : null,
      history: Array.isArray(updated.history) ? updated.history.slice(-30) : [],
    });
  } catch (err) { next(err); }
});

export default router;
