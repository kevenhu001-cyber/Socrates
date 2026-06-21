import { eq, and, gte, desc, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { getDb } from '../db/index.js';
import { users, authSessions, verificationTokens, pendingRegistrations } from '../db/schema.js';
import {
  hashPassword, comparePassword,
  generateSessionToken, generateShortToken, generateLoginCode,
} from '../lib/crypto.js';
import {
  ApiError, BadRequest, Unauthorized, Forbidden, NotFound, Conflict,
} from '../lib/errors.js';
import { verifyCaptcha } from './captcha.js';
import {
  sendVerificationEmail, sendPasswordResetEmail, sendLoginCode,
} from './email.js';

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
export async function register(email, password, captchaToken, captchaAnswer) {
  if (!email || !password) throw new BadRequest('Email and password are required');

  if (!verifyCaptcha(captchaToken, captchaAnswer)) {
    throw new BadRequest('Invalid captcha');
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new BadRequest('Invalid email format');
  }
  if (password.length < MIN_PASSWORD_LENGTH) throw new BadRequest('Password must be at least 8 characters');

  const db = getDb();

  // Check for existing user (already verified)
  const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing) {
    throw new Conflict('An account with this email already exists');
  }

  // Check for existing pending registration
  const [existingPending] = await db.select().from(pendingRegistrations)
    .where(eq(pendingRegistrations.email, normalizedEmail)).limit(1);
  if (existingPending) {
    if (existingPending.expiresAt < new Date()) {
      // Expired — clear it so we can re-create below with a fresh token.
      // Prevents indefinite "resend" abuse and stale-token accumulation.
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
 * Does NOT take a password — the captcha is the only proof that the
 * requester is human. Always returns { ok: true } to avoid leaking
 * which emails have a pending registration.
 */
export async function resendVerification(email, captchaToken, captchaAnswer) {
  if (!email) throw new BadRequest('Email is required');
  if (!verifyCaptcha(captchaToken, captchaAnswer)) {
    throw new BadRequest('Invalid captcha');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const db = getDb();

  const [pending] = await db.select().from(pendingRegistrations)
    .where(eq(pendingRegistrations.email, normalizedEmail)).limit(1);

  // Silently no-op if no pending registration — don't leak which emails
  // are registered or pending. Also no-op if the user is already verified.
  const [existing] = await db.select().from(users)
    .where(eq(users.email, normalizedEmail)).limit(1);
  if (!pending || existing) {
    console.log(`[auth] resend-verification: nothing to do for ${maskEmail(normalizedEmail)}`);
    return { ok: true };
  }

  await sendVerificationEmail(normalizedEmail, pending.token);
  return { ok: true };
}

/**
 * POST /api/auth/login
 */
export async function login(email, password, captchaToken, captchaAnswer) {
  if (!email || !password) throw new BadRequest('Email and password are required');

  if (!verifyCaptcha(captchaToken, captchaAnswer)) {
    throw new BadRequest('Invalid captcha');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (!user) throw new Unauthorized('Invalid email or password');

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw new Unauthorized('Invalid email or password');

  // Reject unverified accounts
  if (!user.verifiedAt) {
    throw new Forbidden('UNVERIFIED', 'Please verify your email before signing in.');
  }

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
    preferences: user.preferences,
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
export async function sendCode(email, captchaToken, captchaAnswer) {
  if (!email) throw new BadRequest('Email is required');

  if (!verifyCaptcha(captchaToken, captchaAnswer)) {
    throw new BadRequest('Invalid captcha');
  }

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

/**
 * POST /api/auth/guest — create an anonymous guest account and start a session.
 * The guest gets a placeholder email (random) and a random password hash they
 * will never use. The frontend stores `socrates-guest` so the user is recognised
 * on subsequent visits.
 */
export async function loginAsGuest() {
  const db = getDb();
  // Random unguessable email so two guest accounts never collide.
  const id = crypto.randomBytes(16).toString('hex');
  const email = `guest-${id}@guest.socrates.local`;
  // Random password hash — guests never log in again, only the sid cookie matters.
  const passwordHash = await hashPassword(crypto.randomBytes(32).toString('hex'));

  const [user] = await db.insert(users).values({
    email,
    passwordHash,
    displayName: 'Guest',
    isGuest: true,
    tier: 'diophantus',
  }).returning();

  const sid = await createSession(user.id);

  return {
    user: publicUser({ ...user, isGuest: true }),
    sid,
  };
}

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
export async function forgotPassword(email, captchaToken, captchaAnswer) {
  if (!email) throw new BadRequest('Email is required');

  if (!verifyCaptcha(captchaToken, captchaAnswer)) {
    throw new BadRequest('Invalid captcha');
  }

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
 */
export async function resetPassword(token, newPassword) {
  if (!token || !newPassword) throw new BadRequest('Token and new password are required');
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new BadRequest('Password must be at least 8 characters');

  const db = getDb();

  const [vt] = await db.select().from(verificationTokens)
    .where(and(
      eq(verificationTokens.token, token),
      eq(verificationTokens.kind, 'password_reset'),
      gte(verificationTokens.expiresAt, new Date()),
    )).limit(1);

  if (!vt) throw new BadRequest('Invalid or expired reset token');

  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, vt.userId));
  await db.delete(verificationTokens).where(eq(verificationTokens.token, token));
}

/**
 * POST /api/auth/password — change password while authenticated.
 * Requires oldPassword for verification, then sets newPassword.
 */
export async function changePassword(userId, oldPassword, newPassword) {
  if (!oldPassword || !newPassword) throw new BadRequest('Current password and new password are required');
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new BadRequest('Password must be at least 8 characters');

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFound('User not found');

  const valid = await comparePassword(oldPassword, user.passwordHash);
  if (!valid) throw new Unauthorized('Current password is incorrect');

  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

/**
 * DELETE /api/auth/account
 */
export async function deleteAccount(userId) {
  const db = getDb();
  await db.delete(users).where(eq(users.id, userId));
}
