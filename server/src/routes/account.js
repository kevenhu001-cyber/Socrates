import { Router } from 'express';
import { eq, count, sql, and, gte } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { users, sessions, apiKeys, usageEvents } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/**
 * POST /api/account/cancel — downgrade a paid subscription back to the
 * free Diophantus tier. Mirrors the front-end My Account "Cancel
 * Subscription" action. Idempotent: calling it on an already-free user
 * is a no-op (returns 200 with the unchanged tier).
 */
router.post('/cancel', async (req, res, next) => {
  try {
    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.userId))
      .limit(1);
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    if (user.tier !== 'diophantus') {
      await db
        .update(users)
        .set({ tier: 'diophantus', plan: null })
        .where(eq(users.id, req.userId));
    }
    return res.json({ ok: true, tier: 'diophantus' });
  } catch (err) { next(err); }
});

/**
 * Plan/tier definitions matching the front-end buildCards() expectations.
 * rank: 0=Free, 1=Basic, 2=Standard, 3=Premium
 */
const TIER_PLANS = {
  diophantus: { name: 'Diophantus', price: 0, rank: 0, maxSessions: 5, maxKeys: 2 },
  riemann:    { name: 'Riemann',    price: 12, rank: 1, maxSessions: 30, maxKeys: 10 },
  descartes:  { name: 'Descartes',  price: 29, rank: 2, maxSessions: 100, maxKeys: 50 },
  euclid:     { name: 'Euclid',     price: 99, rank: 3, maxSessions: 0, maxKeys: 999 },
};

/**
 * GET /api/account/usage — consolidated user + plan + usage data
 * for the My Account dashboard page.
 */
router.get('/usage', async (req, res, next) => {
  try {
    const db = getDb();

    // 1) Fetch the user row
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.userId))
      .limit(1);
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    // 2) Count sessions for this user
    const [sessionResult] = await db
      .select({ value: count() })
      .from(sessions)
      .where(eq(sessions.userId, req.userId));
    const sessionCount = sessionResult?.value ?? 0;

    // 3) Count API keys for this user
    const [keyResult] = await db
      .select({ value: count() })
      .from(apiKeys)
      .where(eq(apiKeys.userId, req.userId));
    const providerCount = keyResult?.value ?? 0;

    // 4) Knowledge-graph node count (aggregated in SQL).
    const [nodeResult] = await db
      .select({ value: sql`COALESCE(SUM(jsonb_array_length(${sessions.kbNodes})), 0)::int` })
      .from(sessions)
      .where(eq(sessions.userId, req.userId));
    const graphNodes = nodeResult?.value ?? 0;

    // 5) Beagle monthly token usage — tier-based quota
    const BEAGLE_QUOTAS = {
      diophantus: 1_000_000,
      riemann:    100_000_000,
      descartes:  300_000_000,
      euclid:     800_000_000,
    };
    const beagleLimit = BEAGLE_QUOTAS[user.tier] || BEAGLE_QUOTAS.diophantus;
    let beagleUsed = 0;
    {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const [beagleRow] = await db
        .select({ value: sql`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int` })
        .from(usageEvents)
        .where(and(eq(usageEvents.userId, req.userId), gte(usageEvents.createdAt, monthStart)));
      beagleUsed = beagleRow?.value ?? 0;
    }

    // 6) Determine plan details from user tier
    const tier = user.tier || 'diophantus';
    const planDef = TIER_PLANS[tier] || TIER_PLANS.diophantus;

    // subscriptionEnd: if user has a plan (paid), estimate 30 days from now
    // as a placeholder; real billing integration would use a subscriptions table.
    const subscriptionEnd = user.plan
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : null;

    // 6) Build user payload (mirrors publicUser shape with subscriptionEnd added)
    const userPayload = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      tier: user.tier,
      plan: user.plan ?? null,
      isGuest: !!user.isGuest,
      verifiedAt: user.verifiedAt,
      createdAt: user.createdAt,
      customInstructions: user.customInstructions,
      preferences: user.preferences ?? {},
      defaultModel: user.defaultModel,
      subscriptionEnd,
    };

    return res.json({
      user: userPayload,
      plan: planDef,
      usage: {
        sessionCount,
        providerCount,
        graphNodes,
        beagleUsed,
        beagleLimit,
      },
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/account/usage-heatmap — hourly token-usage buckets for
 * the heatmap widget on the My Account dashboard. Returns one row
 * per hour for the last 7 days (168 buckets). Hours with no usage
 * are still returned with tokens=0 so the front-end can paint a
 * consistent grid without gap-detection logic.
 *
 * Each bucket carries:
 *   - hour      : ISO timestamp at hour granularity (UTC)
 *   - tokens    : total tokens (prompt + completion) consumed in that hour
 *   - calls     : number of chat completions in that hour
 *
 * The heatmap colors each cell based on its tokens relative to the
 * user's 95th-percentile hour over the window — a percentile-based
 * scale (instead of absolute) keeps the visualisation meaningful for
 * both light and heavy users. */
router.get('/usage-heatmap', async (req, res, next) => {
  try {
    const db = getDb();
    const hours = Math.min(Math.max(parseInt(req.query.hours, 10) || 168, 24), 168);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const rows = await db
      .select({
        hour: sql`date_trunc('hour', ${usageEvents.createdAt})`,
        tokens: sql`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int`,
        calls: sql`COUNT(*)::int`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.userId} = ${req.userId} AND ${usageEvents.createdAt} >= ${since}`)
      .groupBy(sql`date_trunc('hour', ${usageEvents.createdAt})`)
      .orderBy(sql`date_trunc('hour', ${usageEvents.createdAt})`);

    /* Fill in zero-buckets for any hour with no activity so the
       front-end can render a continuous grid without gaps. */
    const byHour = new Map();
    for (const r of rows) {
      byHour.set(new Date(r.hour).toISOString(), { hour: r.hour, tokens: r.tokens, calls: r.calls });
    }
    const filled = [];
    const startMs = Math.floor(since.getTime() / 3600000) * 3600000;
    const endMs = Math.floor(Date.now() / 3600000) * 3600000;
    for (let t = startMs; t <= endMs; t += 3600000) {
      const key = new Date(t).toISOString();
      const existing = byHour.get(key);
      filled.push(existing || { hour: key, tokens: 0, calls: 0 });
    }

    /* Totals + 95th percentile for the heatmap color scale. */
    const totalTokens = filled.reduce((s, b) => s + b.tokens, 0);
    const totalCalls = filled.reduce((s, b) => s + b.calls, 0);
    const sortedNonZero = filled.map((b) => b.tokens).filter((t) => t > 0).sort((a, b) => a - b);
    const p95 = sortedNonZero.length
      ? sortedNonZero[Math.min(sortedNonZero.length - 1, Math.floor(sortedNonZero.length * 0.95))]
      : 0;

    return res.json({
      hours,
      totalTokens,
      totalCalls,
      p95,
      buckets: filled,
    });
  } catch (err) { next(err); }
});

export default router;
