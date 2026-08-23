import crypto from 'node:crypto';
import { getDb } from '../db/index.js';
import { agentApiKeys, users } from '../db/schema.js';
import type { User } from '../types/http.js';
import { eq } from 'drizzle-orm';

/* Credential grammar: "<keyId>.<secret>"
 *   keyId  = "ak_" + 20 lowercase RFC-4648 base32 chars (public identifier)
 *   secret = 32 random bytes, base64url (43 chars) — shown exactly once
 * The stored hash covers the FULL credential string so the keyId cannot be
 * separated from the secret when verifying.
 *
 * P_agent-key-vs-mobile-bearer — the grammar is deliberately disjoint from
 * mobile tokens ("ma.<hex>.<hex>") so requestCredential can route the two
 * without ambiguity, and so an agent key can never be mistaken for (or
 * replayed as) a mobile access token. */
export const AGENT_KEY_RE = /^Bearer (ak_[a-z2-7]{20}\.[A-Za-z0-9_-]{43})$/i;

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function randomBase32(bytes: number): string {
  const buf = crypto.randomBytes(bytes);
  let out = '';
  let bits = 0;
  let acc = 0;
  for (const byte of buf) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(acc << (5 - bits)) & 31];
  return out;
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export type IssuedAgentKey = {
  id: string;
  keyId: string;
  /** Full bearer credential — returned only by createKey, never persisted. */
  credential: string;
  label: string;
  scopes: string[];
  expiresAt: Date | null;
};

export async function createAgentKey(params: {
  ownerUserId: string;
  label: string;
  scopes: string[];
  expiresAt?: Date | null;
}): Promise<IssuedAgentKey> {
  const keyId = `ak_${randomBase32(13).slice(0, 20)}`;
  const secret = crypto.randomBytes(32).toString('base64url');
  const credential = `${keyId}.${secret}`;
  const db = getDb();
  const [row] = await db
    .insert(agentApiKeys)
    .values({
      ownerUserId: params.ownerUserId,
      keyId,
      // Only the SHA-256 of the full credential is ever persisted.
      secretHash: sha256Hex(credential),
      label: params.label,
      scopes: params.scopes,
      expiresAt: params.expiresAt ?? null,
    })
    .returning({ id: agentApiKeys.id });
  return {
    id: row.id,
    keyId,
    credential,
    label: params.label,
    scopes: params.scopes,
    expiresAt: params.expiresAt ?? null,
  };
}

export type VerifiedAgentKey = { user: User; scopes: string[]; keyRowId: string };

/**
 * Verify an `Authorization: Bearer ak_…` credential against the stored
 * SHA-256 digest. Timing-safe on the digest comparison; returns null for
 * unknown, malformed, revoked, expired keys or unknown owners.
 */
export async function verifyAgentKey(bearerValue: string): Promise<VerifiedAgentKey | null> {
  const match = AGENT_KEY_RE.exec(`Bearer ${bearerValue}`);
  if (!match) return null;
  const credential = match[1];

  const dot = credential.indexOf('.');
  const keyId = credential.slice(0, dot);
  const candidateHash = sha256Hex(credential);

  const db = getDb();
  const [row] = await db
    .select()
    .from(agentApiKeys)
    .where(eq(agentApiKeys.keyId, keyId))
    .limit(1);

  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;

  const expected = Buffer.from(row.secretHash, 'utf8');
  const actual = Buffer.from(candidateHash, 'utf8');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, row.ownerUserId))
    .limit(1);
  if (!user) return null;

  // Fire-and-forget liveness marker; never blocks or fails the request.
  void db
    .update(agentApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentApiKeys.id, row.id))
    .catch(() => {});

  return { user, scopes: row.scopes, keyRowId: row.id };
}
