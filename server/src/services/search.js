import { eq, or, sql, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { users, sessions, messages } from '../db/schema.js';
import { BadRequest } from '../lib/errors.js';

/**
 * Search across sessions and messages.
 * POST /api/search
 * Body: { q: string, scope?: string, limit?: number }
 */
export async function searchContent(userId, { q, scope = 'all', limit = 20 }) {
  if (!q || !q.trim()) throw new BadRequest('Search query is required');

  const db = getDb();
  const maxLimit = Math.min(limit, 100);
  const pattern = `%${q.trim()}%`;
  const hits = [];

  if (scope === 'all' || scope === 'sessions') {
    const sessionHits = await db.select({
      kind: sql`'session'`.as('kind'),
      id: sessions.id,
      title: sessions.title,
      snippet: sql`LEFT(${sessions.topic}, 200)`.as('snippet'),
      updatedAt: sessions.updatedAt,
    }).from(sessions)
      .where(and(
        eq(sessions.userId, userId),
        or(
          sql`${sessions.title} ILIKE ${pattern}`,
          sql`${sessions.topic} ILIKE ${pattern}`,
        ),
      ))
      .limit(maxLimit);

    sessionHits.forEach(s => hits.push({ ...s, sessionId: s.id }));
  }

  if (scope === 'all' || scope === 'messages') {
    const msgHits = await db.select({
      kind: sql`'message'`.as('kind'),
      id: messages.id,
      sessionId: messages.sessionId,
      snippet: sql`LEFT(${messages.content}, 300)`.as('snippet'),
      updatedAt: messages.createdAt,
    }).from(messages)
      .where(sql`${messages.content} ILIKE ${pattern}`)
      .limit(maxLimit);

    msgHits.forEach(m => hits.push(m));
  }

  // Sort by updatedAt descending, limit
  hits.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return { hits: hits.slice(0, maxLimit) };
}
