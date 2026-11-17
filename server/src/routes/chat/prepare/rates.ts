/**
 * Per-tier token quota checks and the chat rate-limit dispatcher.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { TooManyRequests } from '../../../lib/errors.js';
import { getBeagleQuota } from '../../../lib/tiers.js';
import { getDb } from '../../../db/index.js';
import { usageEvents } from '../../../db/schema/index.js';
import { pickChatLimiterFor } from '../../../middleware/rateLimit.js';
import type { NextFunction, Request, Response } from 'express';

/* ─────────────────────────────────────────────────────────────────
   Per-tier monthly Beagle token quota check
   ───────────────────────────────────────────────────────────────── */

export async function checkBeagleMonthlyLimit(userId: string | null, tier?: string | null): Promise<TooManyRequests | null> {
  if (!userId) return null;
  const quota = getBeagleQuota(tier);
  const db = getDb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [row] = await db.select({
    used: sql<number>`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int`,
  }).from(usageEvents)
    .where(and(
      eq(usageEvents.userId, userId),
      gte(usageEvents.createdAt, monthStart),
    ));
  const used = row?.used || 0;
  if (used >= quota) {
    return new TooManyRequests(
      `Monthly Beagle token limit (${quota.toLocaleString()}) reached. ` +
      `You have used ${used.toLocaleString()} tokens this month. ` +
      'Add your own API key in Account → API Keys to continue, or wait until next month.',
    );
  }
  return null;
}


/* P_tutor-pool — use a request-time middleware that picks the right
   limiter based on req.body.mode. Tutor → tutorChatLimiter (separate
   bucket, higher cap). Anything else → chatLimiter. Static middleware
   arrays can't branch, so we wrap the pick in a thin dispatcher. */
export function chatRateLimitDispatch(req: Request, res: Response, next: NextFunction) {
  return pickChatLimiterFor(req)(req, res, next);
}

