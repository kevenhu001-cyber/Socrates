import crypto from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { oauthAccessTokens, users } from '../db/schema.js';
import { sha256Hex } from './agentKeys.js';
import type { User } from '../types/http.js';

/* ── Lifetimes ─────────────────────────────────────────────── */
export const ACCESS_TOKEN_TTL_S = 60 * 60;
export const REFRESH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/* Self-describing token grammars. requestCredential must be able to route an
 * Authorization header among mobile (ma.*), agent-key (ak_*), and OAuth
 * credentials WITHOUT a database probe per unknown value, so issued tokens
 * carry an explicit prefix: at_/rt_ + 32-byte base64url. Clients treat them
 * as opaque; only SHA-256 digests are ever persisted. */
export const OAUTH_ACCESS_TOKEN_RE = /^Bearer (at_[A-Za-z0-9_-]{43})$/;
export const OAUTH_REFRESH_TOKEN_RE = /^rt_[A-Za-z0-9_-]{43}$/;

function newToken(prefix: string): string {
  return prefix + crypto.randomBytes(32).toString('base64url');
}

export type IssuedTokenPair = { accessToken: string; refreshToken: string };

/**
 * Mint an access/refresh pair and persist their SHA-256 digests.
 *
 * `refreshWindowAnchor` pins the 30-day refresh window to an earlier moment —
 * used on rotation so a refreshed family can never outlive its original
 * grant. Access-token expiry is always relative to NOW.
 */
export async function issueTokenPair(params: {
  clientId: string;
  userId: string;
  scopes: string[];
  refreshWindowAnchor?: Date;
}): Promise<IssuedTokenPair> {
  const accessToken = newToken('at_');
  const refreshToken = newToken('rt_');
  const db = getDb();
  await db.insert(oauthAccessTokens).values({
    tokenHash: sha256Hex(accessToken),
    refreshTokenHash: sha256Hex(refreshToken),
    clientId: params.clientId,
    userId: params.userId,
    scopes: params.scopes,
    createdAt: params.refreshWindowAnchor ?? new Date(),
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_S * 1000),
  });
  return { accessToken, refreshToken };
}

/**
 * True when the row's refresh half is still inside the 30-day window anchored
 * at the ORIGINAL grant's createdAt.
 */
export function refreshWithinWindow(row: typeof oauthAccessTokens.$inferSelect): boolean {
  return Date.now() - row.createdAt.getTime() <= REFRESH_WINDOW_MS;
}

export type VerifiedOAuthToken = { user: User; scopes: string[] };

/**
 * Resolve an `Authorization: Bearer at_…` credential against the stored
 * SHA-256 digest. Returns null for unknown, revoked, expired tokens.
 */
export async function verifyOAuthAccessToken(bearerValue: string): Promise<VerifiedOAuthToken | null> {
  if (!OAUTH_ACCESS_TOKEN_RE.test(`Bearer ${bearerValue}`)) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(oauthAccessTokens)
    .where(and(eq(oauthAccessTokens.tokenHash, sha256Hex(bearerValue)), isNull(oauthAccessTokens.revokedAt)))
    .limit(1);
  if (!row || row.expiresAt < new Date()) return null;

  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user) return null;
  return { user, scopes: row.scopes };
}

/**
 * RFC 7009 revocation scoped to one client: kills whichever half of a pair
 * matches the presented value (and leaves foreign-client rows untouched).
 * Returns true when an access-token half was found.
 */
export async function revokeTokenValue(clientId: string, tokenValue: string): Promise<boolean> {
  const db = getDb();
  const hash = sha256Hex(tokenValue);
  const liveClientScope = and(
    eq(oauthAccessTokens.clientId, clientId),
    isNull(oauthAccessTokens.revokedAt),
  );
  const byAccess = await db
    .update(oauthAccessTokens)
    .set({ revokedAt: new Date() })
    .where(and(liveClientScope, eq(oauthAccessTokens.tokenHash, hash)))
    .returning({ tokenHash: oauthAccessTokens.tokenHash });
  await db
    .update(oauthAccessTokens)
    .set({ revokedAt: new Date() })
    .where(and(liveClientScope, eq(oauthAccessTokens.refreshTokenHash, hash)));
  return byAccess.length > 0;
}
