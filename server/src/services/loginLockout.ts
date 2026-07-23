/**
 * Per-email login lockout — DB-backed.
 *
 * Tracks failed password attempts per email and applies a temporary
 * lockout once a threshold is reached. This is the second line of
 * defence behind `authLimiter` (per-IP): that one stops a single IP
 * from spamming logins, but a distributed brute force across many
 * IPs against a single account slips through. This module closes
 * that gap.
 *
 * P_loginLockout-persist — H3 audit fix. Counts are persisted to the
 * `login_failures` table (one row per email, UPSERTed) so the lockout
 * is process-global. Safe under multi-worker / cluster deployments:
 * an attacker rotating across worker processes cannot exceed the
 * threshold by a factor of N.
 *
 * Limits:
 *   - Threshold: 5 failed attempts within the window.
 *   - Window: 15 minutes (sliding — first failure starts the clock).
 *   - Lockout: 15 minutes once the threshold is hit.
 *
 * Both numbers are deliberately conservative. A legit user who
 * mistypes their password 4 times in 15 minutes is unusual; 5+
 * indicates a brute-force loop.
 */
import { TooManyRequests } from '../lib/errors.js';
import { eq, sql, and, isNull, or, lt, gt } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { loginFailures } from '../db/schema.js';

const WINDOW_MS = 15 * 60 * 1000;       // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000;      // 15 minutes
const THRESHOLD = 5;                    // failed attempts to trigger lockout

/**
 * Best-effort prune of expired rows. Cheap because login_failures
 * is small (one row per attacking email) and we only run this on
 * lockout checks, not on every login.
 */
async function pruneExpired() {
  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - WINDOW_MS);
    // delete rows where window expired AND no active lockout
    await db.delete(loginFailures).where(
      and(
        lt(loginFailures.firstAt, cutoff),
        or(isNull(loginFailures.lockedUntil), lt(loginFailures.lockedUntil, new Date())),
      ),
    );
  } catch (_) { /* prune failures are non-fatal */ }
}

/**
 * Throw TooManyRequests if this email is currently locked out.
 * Call this BEFORE attempting the password comparison so the
 * failure doesn't even reach bcrypt.
 */
export async function checkLockout(email: string) {
  if (!email) return;
  // Lazy prune — runs once per call but is cheap.
  pruneExpired();
  const db = getDb();
  const key = email.toLowerCase();
  const [rec] = await db.select().from(loginFailures)
    .where(eq(loginFailures.email, key)).limit(1);
  if (!rec) return;
  if (rec.lockedUntil && rec.lockedUntil > new Date()) {
    const remainingMs = rec.lockedUntil.getTime() - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    throw new TooManyRequests(
      `Too many failed login attempts. Try again in ${remainingMin} minute(s).`
    );
  }
}

/**
 * Record a failed attempt. Call this from the login() function
 * when bcrypt says "no match".
 *
 * Concurrency-safe: uses a single atomic upsert so two concurrent
 * failures can never observe the same baseline and overwrite each
 * other with the same absolute count. The `count = count + 1`
 * increment lives in the ON CONFLICT branch, where PostgreSQL
 * serialises conflicting writes per row.
 *
 * Window logic (also inside the SQL):
 *   - If the existing row's `first_at` is inside the rolling window
 *     AND there is no active lock, increment count and (when the
 *     threshold is reached) set `locked_until`.
 *   - If the window has elapsed (or the row is absent), reset
 *     `count` to 1 and refresh `first_at` to now.
 *   - If a lock is already in force, leave the row untouched so
 *     concurrent failures don't reset the lockout clock.
 */
export async function recordFailure(email: string) {
  if (!email) return;
  const db = getDb();
  const key = email.toLowerCase();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + LOCKOUT_MS);

  await db.insert(loginFailures)
    .values({
      email: key,
      count: 1,
      firstAt: now,
      lockedUntil: null,
    })
    .onConflictDoUpdate({
      target: loginFailures.email,
      set: {
        count: sql`CASE
          WHEN ${loginFailures.lockedUntil} IS NOT NULL AND ${loginFailures.lockedUntil} > NOW() THEN ${loginFailures.count}
          WHEN ${loginFailures.firstAt} < ${new Date(now.getTime() - WINDOW_MS)} THEN 1
          ELSE ${loginFailures.count} + 1
        END`,
        firstAt: sql`CASE
          WHEN ${loginFailures.lockedUntil} IS NOT NULL AND ${loginFailures.lockedUntil} > NOW() THEN ${loginFailures.firstAt}
          WHEN ${loginFailures.firstAt} < ${new Date(now.getTime() - WINDOW_MS)} THEN ${now}
          ELSE ${loginFailures.firstAt}
        END`,
        lockedUntil: sql`CASE
          WHEN ${loginFailures.lockedUntil} IS NOT NULL AND ${loginFailures.lockedUntil} > NOW() THEN ${loginFailures.lockedUntil}
          WHEN ${loginFailures.count} + 1 >= ${THRESHOLD} THEN ${lockedUntil}
          WHEN ${loginFailures.firstAt} < ${new Date(now.getTime() - WINDOW_MS)} THEN NULL
          ELSE ${loginFailures.lockedUntil}
        END`,
      },
    });
}

/**
 * Clear the failure counter — call on successful login so a legit
 * user who fat-fingered 4 times then got it right isn't punished
 * for the next 15 minutes by a stale lock.
 */
export async function recordSuccess(email: string) {
  if (!email) return;
  try {
    const db = getDb();
    await db.delete(loginFailures).where(eq(loginFailures.email, email.toLowerCase()));
  } catch (_) { /* non-fatal */ }
}