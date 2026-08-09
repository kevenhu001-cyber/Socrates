import crypto from 'node:crypto';
import { and, eq, gt, gte } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { authSessions, users } from '../db/schema.js';
import { Unauthorized } from './errors.js';
import { generateSessionToken } from './crypto.js';

const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ACCESS_PREFIX = 'sma1';
const REFRESH_PREFIX = 'mrt1_';
const OAUTH_EXCHANGE_PREFIX = 'mox1_';
const WEB_SESSION_PREFIX = 'mws1.';
const WEB_SESSION_TTL_MS = 60 * 1000;
const BROWSER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const EMBEDDED_TARGETS = [
  'projects',
  'scheduled',
  'plugins',
  'knowledge',
  'mistakes',
  'skills',
  'api-settings',
] as const;

export type EmbeddedTarget = typeof EMBEDDED_TARGETS[number];

export function isEmbeddedTarget(value: unknown): value is EmbeddedTarget {
  return typeof value === 'string' && (EMBEDDED_TARGETS as readonly string[]).includes(value);
}

function secret() {
  return process.env.SESSION_SECRET || 'dev-secret';
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(input: string) {
  return crypto.createHmac('sha256', secret()).update(input).digest('base64url');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export interface MobileTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
}

export function createMobileAccessToken(userId: string, now = Date.now()) {
  const payload = { sub: userId, aud: 'mobile', exp: now + ACCESS_TTL_MS };
  const body = encode(payload);
  return `${ACCESS_PREFIX}.${body}.${sign(body)}`;
}

export function parseMobileAccessToken(token: string, now = Date.now()) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3 || parts[0] !== ACCESS_PREFIX) return null;
  const [, body, signature] = parts;
  if (!safeEqual(signature, sign(body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      sub?: string; aud?: string; exp?: number;
    };
    if (payload.aud !== 'mobile' || !payload.sub || !payload.exp || payload.exp <= now) return null;
    return payload as { sub: string; aud: 'mobile'; exp: number };
  } catch {
    return null;
  }
}

export async function issueMobileTokens(userId: string, now = Date.now()): Promise<MobileTokenPair> {
  const db = getDb();
  const refreshToken = `${REFRESH_PREFIX}${generateSessionToken()}`;
  const refreshExpiresAt = new Date(now + REFRESH_TTL_MS);
  await db.insert(authSessions).values({ token: refreshToken, userId, expiresAt: refreshExpiresAt });
  return {
    accessToken: createMobileAccessToken(userId, now),
    refreshToken,
    expiresAt: new Date(now + ACCESS_TTL_MS).toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
  };
}

export async function verifyMobileAccessToken(token: string) {
  const parsed = parseMobileAccessToken(token);
  if (!parsed) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, parsed.sub)).limit(1);
  return user || null;
}

export async function rotateMobileRefreshToken(refreshToken: string) {
  if (!refreshToken.startsWith(REFRESH_PREFIX)) throw new Unauthorized('Invalid mobile refresh token');
  const db = getDb();
  const [session] = await db.select().from(authSessions).where(and(
    eq(authSessions.token, refreshToken),
    gte(authSessions.expiresAt, new Date()),
  )).limit(1);
  if (!session) throw new Unauthorized('Mobile refresh token expired');
  await db.delete(authSessions).where(eq(authSessions.token, refreshToken));
  return issueMobileTokens(session.userId);
}

export async function revokeMobileRefreshToken(refreshToken: string | null | undefined) {
  if (!refreshToken || !refreshToken.startsWith(REFRESH_PREFIX)) return;
  const db = getDb();
  await db.delete(authSessions).where(eq(authSessions.token, refreshToken));
}

export async function issueMobileOAuthExchangeToken(userId: string) {
  const db = getDb();
  const token = `${OAUTH_EXCHANGE_PREFIX}${generateSessionToken()}`;
  await db.insert(authSessions).values({ token, userId, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
  return token;
}

export async function exchangeMobileOAuthToken(exchangeToken: string) {
  if (!exchangeToken.startsWith(OAUTH_EXCHANGE_PREFIX)) throw new Unauthorized('Invalid mobile OAuth token');
  const db = getDb();
  const [session] = await db.select().from(authSessions).where(and(
    eq(authSessions.token, exchangeToken),
    gte(authSessions.expiresAt, new Date()),
  )).limit(1);
  if (!session) throw new Unauthorized('Mobile OAuth token expired');
  await db.delete(authSessions).where(eq(authSessions.token, exchangeToken));
  return issueMobileTokens(session.userId);
}

/**
 * Creates a short-lived, one-time handoff for a first-party WebView. The
 * target is part of the opaque token key, so a caller cannot swap the target
 * while retaining a valid database row.
 */
export async function issueMobileWebSessionToken(userId: string, target: EmbeddedTarget, now = Date.now()) {
  const db = getDb();
  const token = `${WEB_SESSION_PREFIX}${target}.${generateSessionToken()}`;
  const expiresAt = new Date(now + WEB_SESSION_TTL_MS);
  await db.insert(authSessions).values({ token, userId, expiresAt });
  return { token, expiresAt };
}

export function getEmbeddedTargetFromWebSessionToken(token: string): EmbeddedTarget | null {
  if (!token.startsWith(WEB_SESSION_PREFIX)) return null;
  const target = token.slice(WEB_SESSION_PREFIX.length).split('.', 1)[0];
  return isEmbeddedTarget(target) ? target : null;
}

/** Atomically consumes a WebView handoff and creates a normal browser sid. */
export async function exchangeMobileWebSessionToken(token: string, now = new Date()) {
  const target = getEmbeddedTargetFromWebSessionToken(token);
  if (!target) throw new Unauthorized('Invalid mobile web session');

  const db = getDb();
  return db.transaction(async (tx) => {
    const [handoff] = await tx.delete(authSessions).where(and(
      eq(authSessions.token, token),
      gt(authSessions.expiresAt, now),
    )).returning();
    if (!handoff) throw new Unauthorized('Mobile web session expired or already used');

    const sid = generateSessionToken();
    await tx.insert(authSessions).values({
      token: sid,
      userId: handoff.userId,
      expiresAt: new Date(now.getTime() + BROWSER_SESSION_TTL_MS),
    });
    return { sid, userId: handoff.userId, target };
  });
}
