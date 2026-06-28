import { Router } from 'express';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { usageEvents } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { getBeagleQuota } from '../lib/tiers.js';

const router = Router();
router.use(requireAuth);

/* GET /api/usage
 *
 * Aggregate token usage over a recent time window. The previous
 * implementation summed `messages.tokenCount` which is NEVER
 * populated by the current chat pipeline (token accounting lives
 * in `usage_events`). Switched to `usageEvents` so the endpoint
 * returns real numbers.
 */
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

    const [result] = await db.select({
      totalTokens: sql`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int`,
      messageCount: sql`COUNT(*)::int`,
    }).from(usageEvents)
      .where(and(
        eq(usageEvents.userId, req.userId),
        gte(usageEvents.createdAt, since),
      ));

    return res.json({
      period,
      totalTokens: result.totalTokens || 0,
      messageCount: result.messageCount || 0,
    });
  } catch (err) { next(err); }
});

/* GET /api/usage/limits — returns plan limits + Beagle monthly usage */
router.get('/limits', async (req, res, next) => {
  try {
    const { tier } = req.user || {};
    const limits = {
      diophantus: { tokenQuota: 500000, hardLimit: true },
      riemann: { tokenQuota: 2000000, hardLimit: false },
      descartes: { tokenQuota: 10000000, hardLimit: false },
      euclid: { tokenQuota: null, hardLimit: false },
    };
    const tierKey = tier || 'diophantus';
    const beagleLimit = getBeagleQuota(tierKey);
    let beagleUsed = 0;
    const db = getDb();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [row] = await db.select({
      used: sql`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int`,
    }).from(usageEvents)
      .where(and(eq(usageEvents.userId, req.userId), gte(usageEvents.createdAt, monthStart)));
    beagleUsed = row?.used || 0;
    return res.json({
      plan: tierKey,
      ...(limits[tierKey] || limits.diophantus),
      beagleLimit,
      beagleUsed,
    });
  } catch (err) { next(err); }
});

/* GET /api/usage/daily — daily token counts for heatmap (last 365 days)

   Two bugs were in the original implementation:
   1. Date timezone: DATE(${messages.createdAt}) returns the date in the
      Postgres session timezone (Asia/Shanghai on this server), but the
      client builds the cell key via d.toISOString().slice(0,10) which
      is UTC. Chats near 00:00 local time landed in the wrong bucket
      and the heatmap showed 0 for those days. Fixed by using
      to_char(..., AT TIME ZONE 'UTC', 'YYYY-MM-DD') so the server
      always returns UTC dates the client can match.
   2. Token source: messages.token_count was never populated for
      existing rows (0/152 non-null), so SUM was always 0. The actual
      billing/usage data lives in usageEvents. Switched to that table
      and filtered to source='chat' so title-generation events
      (small overhead) don't bloat the heatmap. */
router.get('/daily', async (req, res, next) => {
  try {
    const db = getDb();
    const { days = '365' } = req.query;
    const since = new Date(Date.now() - parseInt(days, 10) * 86400000);

    const dayExpr = sql`to_char(${usageEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

    const rows = await db.select({
      day: dayExpr,
      tokens: sql`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int`,
      messages: sql`COUNT(*)::int`,
    }).from(usageEvents)
      .where(and(
        eq(usageEvents.userId, req.userId),
        eq(usageEvents.source, 'chat'),
        gte(usageEvents.createdAt, since),
      ))
      .groupBy(dayExpr)
      .orderBy(dayExpr);

    return res.json({ days: parseInt(days, 10), entries: rows });
  } catch (err) { next(err); }
});

export default router;
