import { Router } from 'express';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { messages, sessions } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/* GET /api/usage */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { period = 'month' } = req.query;

    const now = new Date();
    let since;
    if (period === 'day') since = new Date(now.getTime() - 86400000);
    else if (period === 'week') since = new Date(now.getTime() - 7 * 86400000);
    else if (period === 'month') since = new Date(now.getTime() - 30 * 86400000);
    else since = new Date(0);

    // Scope to the current user's messages via their sessions.
    // (messages.session_id -> sessions.user_id)
    const [result] = await db.select({
      totalTokens: sql`COALESCE(SUM(${messages.tokenCount}), 0)::int`,
      messageCount: sql`COUNT(*)::int`,
    }).from(messages)
      .innerJoin(sessions, eq(messages.sessionId, sessions.id))
      .where(and(
        eq(messages.role, 'assistant'),
        eq(sessions.userId, req.userId),
        gte(messages.createdAt, since),
      ));

    return res.json({
      period,
      totalTokens: result.totalTokens,
      messageCount: result.messageCount,
    });
  } catch (err) { next(err); }
});

/* GET /api/usage/limits */
router.get('/limits', async (req, res, next) => {
  try {
    const { tier } = req.user || {};
    const limits = {
      diophantus: { tokenQuota: 500000, hardLimit: true },
      riemann: { tokenQuota: 2000000, hardLimit: false },
      descartes: { tokenQuota: 10000000, hardLimit: false },
      euclid: { tokenQuota: null, hardLimit: false },
    };
    return res.json({ plan: tier || 'diophantus', ...limits[tier] || limits.diophantus });
  } catch (err) { next(err); }
});

export default router;
