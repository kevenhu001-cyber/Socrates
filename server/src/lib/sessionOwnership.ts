import { and, eq } from 'drizzle-orm';
import { sessions } from '../db/schema.js';
import type { Database } from '../db/index.js';
import { BadRequest, NotFound } from './errors.js';
import { isUuid } from './validate.js';

/**
 * Parse the optional session identifier carried by a chat request.
 *
 * A session identifier is an authority-bearing value: it selects the
 * conversation whose streaming state and code-interpreter scratch space are
 * touched by the request. Do not silently coerce an invalid value to null,
 * because that can turn a malformed client request into an unbound execution.
 */
export function parseChatSessionId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !isUuid(value)) {
    throw new BadRequest('Invalid session ID format');
  }
  return value;
}

/**
 * Fetch a session only when it belongs to the authenticated caller.
 *
 * Keep the ownership predicate in the query itself, rather than fetching by
 * id and comparing in JavaScript. This avoids exposing whether another
 * tenant's session exists and gives every caller the same invariant.
 */
export async function getOwnedSession(
  db: Database,
  sessionId: string,
  userId: string,
) {
  const [session] = await db.select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);
  return session || null;
}

/** Resolve an owned session or return a non-enumerating 404. */
export async function requireOwnedSession(
  db: Database,
  sessionId: string,
  userId: string,
) {
  const session = await getOwnedSession(db, sessionId, userId);
  if (!session) throw new NotFound('Session not found');
  return session;
}
