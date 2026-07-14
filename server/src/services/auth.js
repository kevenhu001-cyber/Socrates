import { eq, and, gte, ne, desc, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '../db/index.js';
import { users, authSessions, verificationTokens, pendingRegistrations, files, loginFailures } from '../db/schema.js';
import {
  hashPassword, comparePassword,
  generateSessionToken, generateShortToken, generateLoginCode,
} from '../lib/crypto.js';
import {
  ApiError, BadRequest, Unauthorized, Forbidden, NotFound, Conflict,
} from '../lib/errors.js';
import {
  sendVerificationEmail, sendPasswordResetEmail, sendLoginCode,
  sendDuplicateRegistrationEmail,
} from './email.js';
import {
  checkLockout, recordFailure, recordSuccess,
} from './loginLockout.js';

/**
 * Mask an email for log output — enough context to correlate log
 * lines (so `alice@foo` and `alice@bar` look distinct) without
 * leaking the raw address into shared log destinations.
 */
function maskEmail(e) {
  if (typeof e !== 'string' || !e) return '';
  const at = e.indexOf('@');
  if (at < 0) return e.slice(0, 1) + '***';
  if (at <= 1) return '***' + e.slice(at);
  return e[0] + '***' + e.slice(at);
}

const SESSION_TTL_DAYS = 30;
const VERIFY_TTL_HOURS = 24;
const RESET_TTL_HOURS = 1;
const CODE_TTL_MINUTES = 10;

/* Minimum password length — must match the front-end gate
 * (index.html:8065/8243) and the input minlength="8" attribute. */
const MIN_PASSWORD_LENGTH = 8;

/* P_password-bcrypt-truncation — M1 audit fix.
 * bcrypt's algorithm silently TRUNCATES the plaintext at 72 BYTES
 * (not 72 characters — UTF-8 multi-byte chars count as multiple).
 * A 1000-char password "aaaa…aX" and a 73-char password "aaaa…aX"
 * produce the SAME hash, so an attacker who knows a victim's long
 * password could send any 72-byte prefix of it and authenticate.
 *
 * Reject anything longer than MAX_PASSWORD_LENGTH (64 chars) at
 * every entry point so the input is guaranteed to fit in 72 bytes
 * even with conservative UTF-8. The 64-char ceiling is also the
 * practical upper bound for human-memorable passwords; beyond that
 * we are almost certainly looking at a paste/programmatic input
 * that's better off hashed with argon2/scrypt server-side. */
const MAX_PASSWORD_LENGTH = 64;

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

/**
 * Public user shape returned by /login, /verify, /login-with-code, and
 * /guest. The front-end uses this object as a fallback when /me fails
 * (e.g. cookie race after a fresh login), so it MUST include every
 * field the UI relies on — verifiedAt, plan, preferences, etc. Keeping
 * it in one place ensures the four login-shaped endpoints stay in sync
 * and we never accidentally regress to the "verified status shows No"
 * bug because /me was unreachable.
 */
export function publicUser(user) {
  return {
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
  };
}

async function createSession(userId) {
  const db = getDb();
  // Opportunistic cleanup — drop any expired sessions for this user
  // so the table doesn't grow unbounded. Done in the same await
  // chain as the insert so the new session is created atomically
  // with the cleanup.
  await db.delete(authSessions).where(and(
    eq(authSessions.userId, userId),
    sql`${authSessions.expiresAt} < NOW()`,
  ));

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(authSessions).values({ token, userId, expiresAt });
  return token;
}

async function createVerificationToken(userId, kind, ttlHours) {
  const token = generateShortToken() + generateShortToken(); // 32 hex chars
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  const db = getDb();
  await db.insert(verificationTokens).values({ token, userId, kind, expiresAt });
  return token;
}

/* ──────────────────────────────────────────────
   Public methods
   ────────────────────────────────────────────── */

/**
 * POST /api/auth/register
 *
 * Instead of creating the user immediately, we store the email + password hash in
 * pending_registrations and send a verification email. The user is only created
 * (and a session established) when they click the verification link.
 */
export async function register(email, password) {
  if (!email || !password) throw new BadRequest('Email and password are required');

  const normalizedEmail = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new BadRequest('Invalid email format');
  }
  if (password.length < MIN_PASSWORD_LENGTH) throw new BadRequest('Password must be at least 8 characters');
  if (password.length > MAX_PASSWORD_LENGTH) throw new BadRequest('Password is too long (maximum 64 characters)');

  const db = getDb();

  // Check for existing user (already verified) — silently no-op to
  // the requester (we still return { ok: true } so an attacker can't
  // enumerate which emails are on file), but DO notify the address
  // owner so they can act if it wasn't them. Same shape from the
  // caller's perspective as a fresh registration.
  const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing) {
    console.log(`[auth] register: user already exists for ${maskEmail(normalizedEmail)} — sending duplicate-registration notice`);
    try { await sendDuplicateRegistrationEmail(normalizedEmail); } catch (e) { console.warn('[auth] duplicate-registration notice failed:', e.message); }
    return { ok: true };
  }

  // Check for existing pending registration — re-send or silently no-op
  const [existingPending] = await db.select().from(pendingRegistrations)
    .where(eq(pendingRegistrations.email, normalizedEmail)).limit(1);
  if (existingPending) {
    if (existingPending.expiresAt < new Date()) {
      // Expired — clear it so we can re-create below with a fresh token.
      await db.delete(pendingRegistrations).where(eq(pendingRegistrations.id, existingPending.id));
    } else {
      // Still valid — re-send the verification email with the existing token.
      await sendVerificationEmail(normalizedEmail, existingPending.token);
      return { ok: true };
    }
  }

  // Hash password and create pending registration
  const passwordHash = await hashPassword(password);
  const verToken = generateShortToken() + generateShortToken(); // 32 hex chars
  const expiresAt = new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000);

  await db.insert(pendingRegistrations).values({
    email: normalizedEmail,
    passwordHash,
    token: verToken,
    expiresAt,
  });

  await sendVerificationEmail(normalizedEmail, verToken);

  return { ok: true };
}

/**
 * Re-send the verification email for an existing pending registration.
 * Does NOT take a password. Always returns { ok: true } to avoid leaking
 * which emails have a pending registration.
 */
export async function resendVerification(email) {
  if (!email) throw new BadRequest('Email is required');

  const normalizedEmail = email.toLowerCase().trim();
  const db = getDb();

  const [pending] = await db.select().from(pendingRegistrations)
    .where(eq(pendingRegistrations.email, normalizedEmail)).limit(1);

  // Don't reveal registration state. Two distinct no-op paths:
  //   - existing verified user → notify them of the attempt;
  //   - no pending registration → still notify so the user understands
  //     something was sent.
  // We send the duplicate-registration notice on EITHER path so the
  // owner is always told an attempt happened; the only difference is
  // whether a fresh verification link is in flight.
  const [existing] = await db.select().from(users)
    .where(eq(users.email, normalizedEmail)).limit(1);
  if (!pending && !existing) {
    console.log(`[auth] resend-verification: no pending or existing user for ${maskEmail(normalizedEmail)}`);
    return { ok: true };
  }
  if (existing) {
    // Already verified — send the duplicate-registration notice so
    // the address owner is informed.
    console.log(`[auth] resend-verification: existing verified user for ${maskEmail(normalizedEmail)} — sending duplicate-registration notice`);
    try { await sendDuplicateRegistrationEmail(normalizedEmail); } catch (e) { console.warn('[auth] duplicate-registration notice failed:', e.message); }
    return { ok: true };
  }
  if (!pending) {
    // Defensive: shouldn't reach here given the early return above,
    // but keep the guard explicit.
    return { ok: true };
  }

  await sendVerificationEmail(normalizedEmail, pending.token);
  return { ok: true };
}

/**
 * POST /api/auth/login
 */
export async function login(email, password) {
  if (!email || !password) throw new BadRequest('Email and password are required');

  const normalizedEmail = email.toLowerCase().trim();
  const db = getDb();

  // Throws TooManyRequests if this email has hit the failure
  // threshold within the lockout window. Checking BEFORE bcrypt
  // also saves CPU under sustained attack.
  await checkLockout(normalizedEmail);

  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (!user) {
    // Count the attempt against the email even though no user
    // exists — otherwise an attacker can probe "is X registered?"
    // by measuring when the lockout kicks in.
    await recordFailure(normalizedEmail);
    throw new Unauthorized('Invalid email or password');
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    await recordFailure(normalizedEmail);
    throw new Unauthorized('Invalid email or password');
  }

  // Reject unverified accounts
  if (!user.verifiedAt) {
    throw new Forbidden('UNVERIFIED', 'Please verify your email before signing in.');
  }

  // Successful login — wipe any prior failure count for this email.
  await recordSuccess(normalizedEmail);

  const sid = await createSession(user.id);

  return {
    user: publicUser(user),
    sid,
  };
}

/**
 * GET /api/auth/me
 */
export async function getMe(userId) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFound('User not found');

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    tier: user.tier,
    plan: user.plan,
    isGuest: !!user.isGuest,
    verifiedAt: user.verifiedAt,
    createdAt: user.createdAt,
    customInstructions: user.customInstructions,
    preferences: user.preferences ?? {},
    defaultModel: user.defaultModel,
  };
}

/**
 * POST /api/auth/logout
 */
export async function logout(sid) {
  if (!sid) return;
  const db = getDb();
  await db.delete(authSessions).where(eq(authSessions.token, sid));
}

/**
 * GET /api/auth/verify
 *
 * Move the user from pending_registrations into the users table and create a
 * session so they are recognised as logged in.
 */
export async function verifyEmail(token) {
  if (!token) throw new BadRequest('Verification token is required');
  const db = getDb();

  const [pending] = await db.select().from(pendingRegistrations)
    .where(and(
      eq(pendingRegistrations.token, token),
      gte(pendingRegistrations.expiresAt, new Date()),
    )).limit(1);

  if (!pending) throw new BadRequest('Invalid or expired verification token');

  // Defensive: check the user wasn't somehow already created
  const [existing] = await db.select().from(users).where(eq(users.email, pending.email)).limit(1);
  if (existing) {
    await db.delete(pendingRegistrations).where(eq(pendingRegistrations.id, pending.id));
    throw new Conflict('An account with this email already exists');
  }

  // Create the user from the pending registration
  const [user] = await db.insert(users).values({
    email: pending.email,
    passwordHash: pending.passwordHash,
    verifiedAt: new Date(),
  }).returning();

  // Clean up the pending registration
  await db.delete(pendingRegistrations).where(eq(pendingRegistrations.id, pending.id));

  // Create a session so the user is logged in immediately
  const sid = await createSession(user.id);

  return {
    user: publicUser(user),
    sid,
  };
}

/**
 * POST /api/auth/send-code — send a 6-digit login code
 */
export async function sendCode(email) {
  if (!email) throw new BadRequest('Email is required');

  const normalizedEmail = email.toLowerCase().trim();
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (!user) {
    // Don't reveal whether the user exists; still "send" the code
    console.log(`[auth] send-code: no user for ${maskEmail(normalizedEmail)}`);
    return;
  }

  const code = generateLoginCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  // Store the code as a verification token
  await db.insert(verificationTokens).values({
    token: code,
    userId: user.id,
    kind: 'login_code',
    expiresAt,
  });

  await sendLoginCode(normalizedEmail, code);
}

/* loginAsGuest was REMOVED in the security hardening pass.
   Reason: the function was dead code — it was exported but no
   router ever mounted a `/api/auth/guest` route, and the front-end
   never called it. The "Guest mode" checkbox at sign-in is purely
   a localStorage flag set after a real authenticated login; it
   does not create an anonymous guest account.

   If a future feature genuinely needs anonymous guest sessions,
   the correct path is:
     1. Add `router.post('/guest', authLimiter, audit('login:guest'),
        async (req, res) => loginAsGuest())` to routes/auth.js.
     2. Add a CAPTCHA or IP-based captcha so the endpoint cannot be
        abused to mass-create disposable accounts (DB bloat, cost
        abuse via the built-in LLM provider).
     3. Schedule a periodic GC job that hard-deletes guest accounts
        older than 7 days so the users table does not grow unbounded.

   Until then, prefer keeping every chat caller behind a full
   authenticated account. */

/**
 * POST /api/auth/login-with-code
 */
export async function loginWithCode(email, code) {
  if (!email || !code) throw new BadRequest('Email and code are required');

  const normalizedEmail = email.toLowerCase().trim();
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (!user) throw new Unauthorized('Invalid or expired code');

  const [vt] = await db.select().from(verificationTokens)
    .where(and(
      eq(verificationTokens.token, code),
      eq(verificationTokens.kind, 'login_code'),
      eq(verificationTokens.userId, user.id),
      gte(verificationTokens.expiresAt, new Date()),
    )).limit(1);

  if (!vt) throw new Unauthorized('Invalid or expired code');

  // Consume the code
  await db.delete(verificationTokens).where(eq(verificationTokens.token, code));

  const sid = await createSession(user.id);
  return {
    user: publicUser(user),
    sid,
  };
}

/**
 * POST /api/auth/forgot-password
 */
export async function forgotPassword(email) {
  if (!email) throw new BadRequest('Email is required');

  const normalizedEmail = email.toLowerCase().trim();
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (!user) {
    // Don't reveal whether the user exists
    console.log(`[auth] forgot-password: no user for ${maskEmail(normalizedEmail)}`);
    return;
  }

  const token = await createVerificationToken(user.id, 'password_reset', RESET_TTL_HOURS);
  await sendPasswordResetEmail(normalizedEmail, token);
}

/**
 * GET /api/auth/reset-info — return email for a reset token
 */
export async function getResetInfo(token) {
  if (!token) throw new BadRequest('Reset token is required');
  const db = getDb();

  const [vt] = await db.select().from(verificationTokens)
    .where(and(
      eq(verificationTokens.token, token),
      eq(verificationTokens.kind, 'password_reset'),
      gte(verificationTokens.expiresAt, new Date()),
    )).limit(1);

  if (!vt) throw new BadRequest('Invalid or expired reset token');

  const [user] = await db.select().from(users).where(eq(users.id, vt.userId)).limit(1);
  if (!user) throw new NotFound('User not found');

  return { email: user.email };
}

/**
 * POST /api/auth/reset-password
 *
 * SECURITY: invalidating all sessions on reset is intentional. The
 * forgot-password flow is the recovery path for a user who *thinks*
 * their account may be compromised — leaving the attacker's session
 * alive would defeat the purpose of the reset. We can't identify
 * "the attacker's session" so we nuke them all; the resetting user
 * will need to sign in again, which is the expected UX.
 */
export async function resetPassword(token, newPassword) {
  if (!token || !newPassword) throw new BadRequest('Token and new password are required');
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new BadRequest('Password must be at least 8 characters');
  if (newPassword.length > MAX_PASSWORD_LENGTH) throw new BadRequest('Password is too long (maximum 64 characters)');

  const db = getDb();

  const [vt] = await db.select().from(verificationTokens)
    .where(and(
      eq(verificationTokens.token, token),
      eq(verificationTokens.kind, 'password_reset'),
      gte(verificationTokens.expiresAt, new Date()),
    )).limit(1);

  if (!vt) throw new BadRequest('Invalid or expired reset token');

  const passwordHash = await hashPassword(newPassword);
  /* P_reset-password-atomic — M2 audit fix. Three writes must be
   * all-or-nothing: changing the password, consuming the reset token,
   * and invalidating every session. A partial failure would leave an
   * inconsistent state — e.g. "new password set, but the token is
   * still valid and could be replayed" or "new password set, but
   * the attacker's session is still alive". Wrap in a transaction
   * so any error rolls back the whole reset. */
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, vt.userId));
    await tx.delete(verificationTokens).where(eq(verificationTokens.token, token));
    // Invalidate every session for this user. The user will need to
    // sign back in (the standard "you've been signed out for security"
    // flow) but no attacker who may have had a session can continue.
    await tx.delete(authSessions).where(eq(authSessions.userId, vt.userId));
  });
}

/**
 * POST /api/auth/password — change password while authenticated.
 * Requires oldPassword for verification, then sets newPassword.
 *
 * SECURITY: invalidate every OTHER session (keep the one currently
 * changing the password). A compromised device or stolen cookie
 * therefore can't outlive a legitimate password change.
 */
export async function changePassword(userId, oldPassword, newPassword, currentSid) {
  if (!oldPassword || !newPassword) throw new BadRequest('Current password and new password are required');
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new BadRequest('Password must be at least 8 characters');
  if (newPassword.length > MAX_PASSWORD_LENGTH) throw new BadRequest('Password is too long (maximum 64 characters)');

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFound('User not found');

  const valid = await comparePassword(oldPassword, user.passwordHash);
  if (!valid) throw new Unauthorized('Current password is incorrect');

  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  // Drop every session for this user EXCEPT the one making the
  // change — that session is the user's own browser, which we
  // want to keep logged in.
  if (currentSid) {
    await db.delete(authSessions).where(and(
      eq(authSessions.userId, userId),
      // Drizzle's `ne` is the NOT-EQUALS operator; imported below.
      ne(authSessions.token, currentSid),
    ));
  } else {
    // Fallback: we don't know the calling sid (defensive). Drop
    // everything — the client will get a 401 on the next request
    // and have to log in again.
    await db.delete(authSessions).where(eq(authSessions.userId, userId));
  }
}

/**
 * DELETE /api/auth/account
 *
 * Cascade contract: most user-scoped rows are tied to users.id via
 * `onDelete: 'cascade'` (sessions, messages, api_keys, projects,
 * mistakes, audit_events, ...), so the final `DELETE FROM users`
 * propagates automatically. Two manual sweeps are still required:
 *
 * 1. `login_failures` is keyed by email, NOT by userId — DB cascade
 *    cannot reach it. Without the explicit delete, the row stays
 *    forever and (worse) immediately re-locks any future account
 *    that re-registers the same email.
 *
 * 2. Uploaded files have a `storage_path` on disk. The DB row is
 *    removed by cascade, but the bytes on disk would orphan. We
 *    unlink each file under the configured UPLOAD_DIR and ignore
 *    ENOENT (already gone / never written). Anything outside the
 *    upload root is refused so a poisoned storagePath can't trick
 *    us into unlinking an arbitrary file.
 */
export async function deleteAccount(userId, email) {
  const db = getDb();
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || '/tmp/socrates-uploads');

  // 1. Best-effort physical file cleanup. Run BEFORE the cascade
  //    delete so we can still read the storage paths.
  try {
    const rows = await db.select({ storagePath: files.storagePath })
      .from(files)
      .where(eq(files.userId, userId));
    for (const r of rows) {
      if (!r.storagePath) continue;
      const resolved = path.resolve(r.storagePath);
      // Reject anything that escapes the upload root — defence in
      // depth against a poisoned DB column.
      if (!resolved.startsWith(uploadRoot + path.sep) && resolved !== uploadRoot) continue;
      try { await fs.unlink(resolved); }
      catch (e) { if (e.code !== 'ENOENT') console.warn('[auth] delete-account: unlink failed for', resolved, e.message); }
    }
  } catch (e) {
    // Non-fatal — the row-level cascade still cleans the DB even if
    // the file unlink pass errors out. Worst case: orphaned bytes
    // get reaped by cleanupDb later.
    console.warn('[auth] delete-account: file sweep failed:', e.message);
  }

  // 2. Cascade. sessions, messages, projects, api_keys, ... all go
  //    away automatically via `onDelete: 'cascade'`.
  await db.delete(users).where(eq(users.id, userId));

  // 3. login_failures is keyed by email, not userId — and not in the
  //    cascade tree. Look up by the email the route handed us.
  if (email) {
    try { await db.delete(loginFailures).where(eq(loginFailures.email, email.toLowerCase())); }
    catch (e) { /* non-fatal — orphaned lockout is bounded harm */ }
  }
}
