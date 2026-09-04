/**
 * adminAuth — independent password authentication for the /admin
 * operator console. Production-hardened for a public-facing panel.
 *
 * The console is deliberately NOT the user-login surface: the site
 * owner may not want a full user account just to reach two config
 * forms, and a separate credential keeps the blast radius of a
 * leaked admin password away from the user database.
 *
 * Defence layers (in the order the login route applies them):
 *
 *   1. IP allowlist (ADMIN_IP_ALLOWLIST) — when set, only listed
 *      clients (exact IPs and/or IPv4 CIDR ranges) reach the password
 *      check at all. Everyone else gets an identical 403 before any
 *      credential work happens, so the endpoint does not even reveal
 *      whether ADMIN_PASSWORD is set. Unset = allow all (documented;
 *      recommended for public exposure).
 *
 *   2. Per-IP login-failure lockout — reuses the DB-backed
 *      `login_failures` table (services/loginLockout.ts) under the
 *      `admin-ip:<ip>` key namespace, so the lockout is process-global
 *      across cluster workers the same way the per-email user lockout
 *      is. An attacker rotating across worker processes cannot exceed
 *      the threshold by a factor of N.
 *
 *   3. Slow hash — the configured password is bcrypt-hashed (cost 12,
 *      same BCRYPT_ROUNDS as user passwords) exactly once and memoized;
 *      every verification is a bcrypt.compare against that hash. This
 *      is the brute-force resistance the HMAC path lacked: an online
 *      guess costs ~100ms+ of CPU per attempt instead of a microsecond
 *      digest. Rotation still works by env reload — the memoized hash
 *      is keyed to the source string, and a changed ADMIN_PASSWORD
 *      triggers a re-hash on the next attempt.
 *
 *   4. Key separation — admin session tokens are signed under a key
 *      derived from SESSION_SECRET with a domain-separation label
 *      ("socrates:admin-session:v1"), never the raw user-session
 *      secret. A confused-deputy or context-reuse bug in the user
 *      session layer cannot mint admin tokens, and vice versa.
 *
 *   5. authLimiter (per-IP express-rate-limit) remains the outermost
 *      shared budget; the admin login mounts a dedicated, tighter
 *      limiter on top (see routes/adminAuth.ts).
 *
 * Session: an HMAC-signed opaque token (random 32 bytes + expiry +
 * HMAC-SHA256 over the payload). Stateless — no DB row, TTL 8 hours.
 * The signature comparison is constant-time; the expiry is covered by
 * the signature so a token cannot be replayed past its TTL by editing
 * the second field.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { comparePassword, hashPassword, sessionSecret } from '../lib/crypto.js';

export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

/* Domain-separated signing key. Never reuse the user-session secret
   directly: derive a purpose-bound key so the two token families
   cannot validate each other even if the derivation input is shared. */
const ADMIN_KEY_LABEL = 'socrates:admin-session:v1';
const TOKEN_PURPOSE = 'admin-session:v1';

function deriveAdminSessionKey(): Buffer {
  return createHmac('sha256', sessionSecret()).update(ADMIN_KEY_LABEL).digest();
}

/* ── 1. IP allowlist ───────────────────────────────────────────── */

function ipToLong(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    const n = Number.parseInt(part, 10);
    if (!Number.isInteger(n) || n < 0 || n > 255 || !/^\d{1,3}$/.test(part)) return null;
    out = (out * 256) + n;
  }
  return out >>> 0;
}

/* Parse once per call — the allowlist is tiny (a handful of entries)
   and correctness beats caching here. Returns null when the env var
   is unset/empty, which the caller treats as "allow all". */
export function parseAdminIpAllowlist(): Array<{ ip: number | null; prefix: number | null; raw: string }> | null {
  const raw = process.env.ADMIN_IP_ALLOWLIST;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const entries: Array<{ ip: number | null; prefix: number | null; raw: string }> = [];
  for (const item of raw.split(',')) {
    const entry = item.trim();
    if (!entry) continue;
    const slash = entry.indexOf('/');
    if (slash === -1) {
      entries.push({ ip: ipToLong(entry), prefix: null, raw: entry });
    } else {
      const base = ipToLong(entry.slice(0, slash));
      const prefix = Number.parseInt(entry.slice(slash + 1), 10);
      entries.push({
        ip: base,
        prefix: Number.isInteger(prefix) && prefix >= 0 && prefix <= 32 ? prefix : null,
        raw: entry,
      });
    }
  }
  return entries.length ? entries : null;
}

/**
 * True when the client IP is allowed to reach the admin surface.
 * Unset allowlist = allow all. IPv6 addresses are matched by exact
 * string equality only (documented — operators behind IPv6 should
 * list the exact addresses or front the panel with a proxy that
 * presents a stable v4). An entry that fails to parse never matches.
 * The comparison runs on the numeric form so "203.0.113.7" and
 * "203.0.113.007" cannot diverge.
 */
export function isAdminIpAllowed(ip: string | null | undefined): boolean {
  const list = parseAdminIpAllowlist();
  if (!list) return true;
  if (typeof ip !== 'string' || !ip) return false;
  /* Express may present IPv6-mapped v4 as "::ffff:203.0.113.7" —
     normalise to the bare v4 form so a v4 allowlist entry matches. */
  const candidate = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const candidateLong = ipToLong(candidate);
  for (const entry of list) {
    if (entry.prefix === null) {
      /* Exact match (numeric compare when both sides parse as v4). */
      if (candidateLong !== null && entry.ip !== null && candidateLong === entry.ip) return true;
      /* IPv6 / unparseable: exact string equality. */
      if (candidate === entry.raw) return true;
    } else if (candidateLong !== null && entry.ip !== null && entry.prefix !== null) {
      const mask = entry.prefix === 0 ? 0 : (0xFFFFFFFF << (32 - entry.prefix)) >>> 0;
      if (((candidateLong & mask) >>> 0) === ((entry.ip & mask) >>> 0)) return true;
    }
  }
  return false;
}

/* ── 2. Per-IP lockout key (delegates to services/loginLockout) ── */

export function adminLockoutKey(ip: string | null | undefined): string | null {
  if (typeof ip !== 'string' || !ip) return null;
  /* Same ::ffff: normalisation so the allowlist and the lockout
     counter agree on the client's identity. */
  const candidate = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return `admin-ip:${candidate}`;
}

/* ── 3. Slow hash (memoized bcrypt) ────────────────────────────── */

interface MemoizedHash { source: string; hash: string | null; error: string | null; }
let memo: MemoizedHash | null = null;

/**
 * bcrypt-verify the candidate against the configured ADMIN_PASSWORD.
 * The password is hashed once (cost 12) and memoized; a changed env
 * value re-hashes on the next attempt, so rotation via an env reload
 * does not require a restart. Fails closed on any bcrypt error.
 */
export async function verifyAdminPassword(candidate: unknown): Promise<boolean> {
  const source = process.env.ADMIN_PASSWORD;
  if (typeof source !== 'string' || source.length < 8) return false;
  if (typeof candidate !== 'string' || !candidate || candidate.length > 200) return false;

  if (!memo || memo.source !== source) {
    try {
      memo = { source, hash: await hashPassword(source), error: null };
    } catch (err) {
      /* A bcrypt failure must not fall back to a fast-path compare —
         fail closed and log. */
      memo = { source, hash: null, error: (err as Error).message };
      console.error('[adminAuth] password hash failed:', memo.error);
      return false;
    }
  }
  if (!memo.hash) return false;
  try {
    return await comparePassword(candidate, memo.hash);
  } catch (err) {
    console.error('[adminAuth] compare failed:', (err as Error).message);
    return false;
  }
}

/** Test hook — clears the memoized hash between env rotations. */
export function _resetAdminPasswordMemo(): void {
  memo = null;
}

/** True when the credential is configured (>= 8 chars). The login
    route returns 503 with a clear message when it is not. */
export function adminPasswordConfigured(): boolean {
  const source = process.env.ADMIN_PASSWORD;
  return typeof source === 'string' && source.length >= 8;
}

/* ── 4. Session token (domain-separated, stateless) ────────────── */

function sign(payload: string): string {
  return createHmac('sha256', deriveAdminSessionKey()).update(payload).digest('base64url');
}

/**
 * Issue a signed admin session token. Format:
 *   <purpose>.<random-hex>.<expiry-ms>.<hmac>
 * The purpose segment is covered by the signature, so a token from a
 * different token family (or a user-session token) can never be
 * replayed as an admin token.
 */
export function issueAdminSessionToken(): string {
  const random = randomBytes(32).toString('hex');
  const expiry = String(Date.now() + ADMIN_SESSION_TTL_MS);
  const payload = `${TOKEN_PURPOSE}.${random}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Validate a token. Returns true only when the purpose matches, the
 * signature verifies (constant-time), and the token has not expired.
 */
export function verifyAdminSessionToken(token: unknown): boolean {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [purpose, random, expiry, sig] = parts;
  if (purpose !== TOKEN_PURPOSE || !random || !expiry || !sig) return false;
  const payload = `${purpose}.${random}.${expiry}`;
  const expected = sign(payload);
  if (expected.length !== sig.length) return false;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  const expiryMs = Number.parseInt(expiry, 10);
  if (!Number.isFinite(expiryMs) || expiryMs < Date.now()) return false;
  return true;
}

/* ── 5. Admin gate middleware helper ───────────────────────────── */

export function extractAdminToken(req: { headers: Record<string, unknown>; cookies?: Record<string, unknown> }): string | null {
  const header = req.headers['x-admin-token'];
  if (typeof header === 'string' && header) return header;
  const cookie = req.cookies?.['socrates_admin_session'];
  if (typeof cookie === 'string' && cookie) return cookie;
  return null;
}
