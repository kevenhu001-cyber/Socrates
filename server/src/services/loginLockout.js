/**
 * Per-email login lockout.
 *
 * Tracks failed password attempts per email and applies a temporary
 * lockout once a threshold is reached. This is the second line of
 * defence behind `authLimiter` (per-IP): that one stops a single IP
 * from spamming logins, but a distributed brute force across many
 * IPs against a single account slips through. This module closes
 * that gap.
 *
 * We keep the counter in-process (a Map). Pros:
 *   - No new DB schema.
 *   - Counter resets on restart, which is the right behaviour —
 *     a server restart shouldn't lock real users out forever.
 *   - At ~16 bytes per entry the Map can hold millions of locked
 *     emails without memory pressure; we still prune expired
 *     entries on every check.
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
const WINDOW_MS = 15 * 60 * 1000;       // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000;      // 15 minutes
const THRESHOLD = 5;                    // failed attempts to trigger lockout

// email(lowercase) → { count, firstAt, lockedUntil }
const attempts = new Map();

/**
 * Forget every expired entry from the map. Cheap O(n) sweep —
 * n is bounded by total emails ever seen, which is small relative
 * to memory in practice.
 */
function prune() {
  const now = Date.now();
  for (const [key, rec] of attempts) {
    const expiredWindow = now - rec.firstAt > WINDOW_MS;
    const expiredLock = rec.lockedUntil && now > rec.lockedUntil;
    if (expiredWindow && (!rec.lockedUntil || expiredLock)) {
      attempts.delete(key);
    }
  }
}

/**
 * Throw TooManyRequests if this email is currently locked out.
 * Call this BEFORE attempting the password comparison so the
 * failure doesn't even reach bcrypt.
 */
export function checkLockout(email) {
  if (!email) return;
  prune();
  const rec = attempts.get(email.toLowerCase());
  if (!rec) return;
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) {
    const remainingMs = rec.lockedUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    const err = new Error(`Too many failed login attempts. Try again in ${remainingMin} minute(s).`);
    err.status = 429;
    err.code = 'ACCOUNT_LOCKED';
    err.remainingMs = remainingMs;
    throw err;
  }
}

/**
 * Record a failed attempt. Call this from the login() function
 * when bcrypt says "no match".
 */
export function recordFailure(email) {
  if (!email) return;
  const key = email.toLowerCase();
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now, lockedUntil: null });
    return;
  }
  rec.count += 1;
  if (rec.count >= THRESHOLD) {
    rec.lockedUntil = now + LOCKOUT_MS;
  }
}

/**
 * Clear the failure counter — call on successful login so a legit
 * user who fat-fingered 4 times then got it right isn't punished
 * for the next 15 minutes by a stale lock.
 */
export function recordSuccess(email) {
  if (!email) return;
  attempts.delete(email.toLowerCase());
}