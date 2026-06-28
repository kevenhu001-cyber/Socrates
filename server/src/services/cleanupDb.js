/**
 * Periodic database cleanup — removes expired rows that accumulate
 * from auth sessions, pending registrations, verification tokens,
 * and old high-volume audit / usage events.
 *
 * Runs on a configurable interval (default: 1 hour) so these tables
 * don't grow unbounded. Opportunistic per-request cleanup only covers
 * the current user; this ensures stale rows are cleared globally.
 */
import { lt, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import {
  authSessions, pendingRegistrations, verificationTokens,
  usageEvents, auditEvents,
} from '../db/schema.js';

let _timer = null;

/* Retention windows for the high-volume tables. Operators can override
 * via env vars (in days) without redeploying. The defaults are
 * generous enough that the heatmap still has a year of history while
 * the table stays under a few million rows. */
const USAGE_RETENTION_DAYS = Math.max(7, parseInt(process.env.USAGE_RETENTION_DAYS || '365', 10));
const AUDIT_RETENTION_DAYS = Math.max(7, parseInt(process.env.AUDIT_RETENTION_DAYS || '180', 10));

/**
 * Delete every expired row from authSessions, pendingRegistrations,
 * verificationTokens, and roll off old usage / audit events.
 * Logs the count per table for observability.
 */
export async function runExpiredCleanup() {
  try {
    const db = getDb();
    const now = new Date();

    const expiredAuth = await db.delete(authSessions)
      .where(lt(authSessions.expiresAt, now))
      .returning({ id: authSessions.token });
    const expiredPending = await db.delete(pendingRegistrations)
      .where(lt(pendingRegistrations.expiresAt, now))
      .returning({ id: pendingRegistrations.id });
    const expiredTokens = await db.delete(verificationTokens)
      .where(lt(verificationTokens.expiresAt, now))
      .returning({ id: verificationTokens.token });

    const usageCutoff = new Date(now.getTime() - USAGE_RETENTION_DAYS * 86400000);
    const expiredUsage = await db.delete(usageEvents)
      .where(lt(usageEvents.createdAt, usageCutoff))
      .returning({ id: usageEvents.id });

    const auditCutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86400000);
    const expiredAudit = await db.delete(auditEvents)
      .where(lt(auditEvents.createdAt, auditCutoff))
      .returning({ id: auditEvents.id });

    const total = expiredAuth.length + expiredPending.length + expiredTokens.length
      + expiredUsage.length + expiredAudit.length;
    if (total > 0) {
      console.log(
        `[cleanup] Removed ${expiredAuth.length} session(s), ${expiredPending.length} pending, ` +
        `${expiredTokens.length} token(s), ${expiredUsage.length} usage event(s), ` +
        `${expiredAudit.length} audit event(s)`
      );
    }
  } catch (err) {
    console.error('[cleanup] Failed:', err.message);
  }
}

/**
 * Start the periodic cleanup interval.
 * @param {number} intervalMs - How often to run (default: 1 hour).
 */
export function startExpiredCleanup(intervalMs = 60 * 60 * 1000) {
  if (_timer) return;
  // Run once on boot, then on the interval.
  runExpiredCleanup();
  _timer = setInterval(runExpiredCleanup, intervalMs);
  // unref so the interval doesn't keep the process alive on its own
  // — the HTTP server (or the test runner) is the real owner.
  _timer.unref?.();
  console.log(
    `[cleanup] Started — running every ${Math.round(intervalMs / 60000)} min ` +
    `(usage ${USAGE_RETENTION_DAYS}d, audit ${AUDIT_RETENTION_DAYS}d)`
  );
}

/**
 * Stop the periodic cleanup (for tests / graceful shutdown).
 */
export function stopExpiredCleanup() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}