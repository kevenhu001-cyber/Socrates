import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { BadRequest } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';

const VALID_STATUSES = new Set(['fuzzy', 'internalized', 'blank']);

const router = Router();

router.use(requireAuth);

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

    const conditions = [eq(sessions.userId, req.userId)];
    if (sessionId) conditions.push(eq(sessions.id, String(sessionId)));

    const rows = await db.select({
      id: sessions.id,
      title: sessions.title,
      kbNodes: sessions.kbNodes,
    })
      .from(sessions)
      .where(and(...conditions));

    const items = [];
    const summary = { total: 0, fuzzy: 0, internalized: 0, blank: 0 };

    for (const row of rows) {
      const nodes = Array.isArray(row.kbNodes) ? row.kbNodes : [];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const nodeStatus = typeof node.status === 'string' ? node.status : 'blank';
        const nodeName = typeof node.name === 'string' ? node.name : (typeof node.nodeName === 'string' ? node.nodeName : null);
        const entry = {
          nodeName,
          status: nodeStatus,
          sessionId: row.id,
          sessionTitle: row.title || null,
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

export default router;
