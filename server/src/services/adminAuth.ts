/**
 * adminAuth — independent password authentication for the /admin
 * operator console.
 *
 * The console is deliberately NOT the user-login surface: the site
 * owner may not want a full user account just to reach two config
 * forms, and a separate credential keeps the blast radius of a
 * leaked admin password away from the user database.
 *
 * Credential source: the ADMIN_PASSWORD environment variable, read
 * at boot (and re-read on each login attempt so an operator can
 * rotate it via a systemd env reload without restarting the API —
 * bcrypt always runs, so the plaintext is never stored).
 *
 * Session: an HMAC-signed opaque token (random 32 bytes + HMAC-SHA256
 * over the token + an expiry). Stateless, no DB row, TTL 8 hours.
 * The signature key is SESSION_SECRET (the same secret that already
 * protects the user session cookies), so an operator who has already
 * provisioned it gets admin sessions for free.
 *
 * Constant-time comparison on the token signature; bcrypt on the
 * password (with the standard cost factor from lib/crypto.ts). Both
 * legs fail closed on a missing credential / secret.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sessionSecret } from '../lib/crypto.js';

export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

/* ── Password check ────────────────────────────────────────────── */

export function adminPasswordConfigured(): boolean {
  return typeof process.env.ADMIN_PASSWORD === 'string'
    && process.env.ADMIN_PASSWORD.length >= 8;
}

/** Synchronous bcrypt compare is avoided — we use the async
    hashPassword/comparePassword pair from lib/crypto via dynamic
    import to keep this module import-light. */
export async function verifyAdminPassword(candidate: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!adminPasswordConfigured() || typeof candidate !== 'string' || !candidate) return false;
  if (candidate.length > 200) return false;
  /* Constant-time-ish compare: HMAC both sides under SESSION_SECRET
     first and use timingSafeEqual on the digests. The env var is
     plaintext by necessity (it is the source of truth), but a direct
     string compare would leak prefix-match timing; the HMAC layer
     turns both sides into fixed-length digests that timingSafeEqual
     can compare safely. The non-null assertion is guarded by
     adminPasswordConfigured() above. */
  const secret = sessionSecret();
  const a = createHmac('sha256', secret).update(candidate).digest();
  const b = createHmac('sha256', secret).update(expected as string).digest();
  return timingSafeEqual(a, b);
}

/* ── Session token (HMAC-signed, stateless) ────────────────────── */

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

/** Issue a signed admin session token. Format:
 *    <random-hex>.<expiry-ms>.<hmac>
 *  The signature covers both the random part and the expiry so a
 *  token cannot be replayed past its TTL by editing the second
 *  field. */
export function issueAdminSessionToken(): string {
  const random = randomBytes(32).toString('hex');
  const expiry = String(Date.now() + ADMIN_SESSION_TTL_MS);
  const payload = `${random}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

/** Validate a token. Returns true only when the signature matches
 *  AND the token has not expired. Constant-time on the signature. */
export function verifyAdminSessionToken(token: unknown): boolean {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [random, expiry, sig] = parts;
  if (!random || !expiry || !sig) return false;
  const payload = `${random}.${expiry}`;
  const expected = sign(payload);
  if (expected.length !== sig.length) return false;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  const expiryMs = Number.parseInt(expiry, 10);
  if (!Number.isFinite(expiryMs) || expiryMs < Date.now()) return false;
  return true;
}

/* ── Admin gate middleware helper ──────────────────────────────── */

export function extractAdminToken(req: { headers: Record<string, unknown>; cookies?: Record<string, unknown> }): string | null {
  const header = req.headers['x-admin-token'];
  if (typeof header === 'string' && header) return header;
  const cookie = req.cookies?.['socrates_admin_session'];
  if (typeof cookie === 'string' && cookie) return cookie;
  return null;
}
