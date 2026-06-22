import { Router } from 'express';
import { eq, count, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { users, sessions, apiKeys } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

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

    // 5) Determine plan details from user tier
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
      },
    });
  } catch (err) { next(err); }
});

export default router;
