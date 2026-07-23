import { eq, or, sql, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { users, sessions, messages } from '../db/schema.js';
import { BadRequest } from '../lib/errors.js';

/**
 * Search across sessions and messages using PostgreSQL full-text search.
 * POST /api/search
 * Body: { q: string, scope?: string, limit?: number }
 */
export async function searchContent(userId: string, { q, scope = 'all', limit = 20 }: { q: string; scope?: string; limit?: number }) {
  if (!q || !q.trim()) throw new BadRequest('Search query is required');

  const db = getDb();
  const maxLimit = Math.min(limit, 100);
  const query = q.trim();
  const tsQuery = sql`plainto_tsquery('simple', ${query})`;  // 'simple' config = no stemming, good for multilingual
  const hits: Array<Record<string, unknown>> = [];

  if (scope === 'all' || scope === 'sessions') {
    const sessionHits = await db.select({
      kind: sql`'session'`.as('kind'),
      id: sessions.id,
      title: sessions.title,
      topic: sessions.topic,
      snippet: sql`ts_headline('simple', ${sessions.topic}, ${tsQuery}, 'MaxWords=50, MinWords=10, StartSel=<mark>, StopSel=</mark>')`.as('snippet'),
      updatedAt: sessions.updatedAt,
      rank: sql`ts_rank_cd(to_tsvector('simple', coalesce(${sessions.title}, '') || ' ' || coalesce(${sessions.topic}, '')), ${tsQuery})`.as('rank'),
    }).from(sessions)
      .where(and(
        eq(sessions.userId, userId),
        sql`to_tsvector('simple', coalesce(${sessions.title}, '') || ' ' || coalesce(${sessions.topic}, '')) @@ ${tsQuery}`,
      ))
      .orderBy(sql`rank DESC`)
      .limit(maxLimit);

    sessionHits.forEach(s => hits.push({ ...s, sessionId: s.id }));
  }

  if (scope === 'all' || scope === 'messages') {
    const msgHits = await db.select({
      kind: sql`'message'`.as('kind'),
      id: messages.id,
      sessionId: messages.sessionId,
      snippet: sql`ts_headline('simple', ${messages.content}, ${tsQuery}, 'MaxWords=50, MinWords=10, StartSel=<mark>, StopSel=</mark>')`.as('snippet'),
      updatedAt: messages.createdAt,
      rank: sql`ts_rank_cd(to_tsvector('simple', ${messages.content}), ${tsQuery})`.as('rank'),
    }).from(messages)
      .innerJoin(sessions, eq(messages.sessionId, sessions.id))
      .where(and(
        eq(sessions.userId, userId),
        sql`to_tsvector('simple', ${messages.content}) @@ ${tsQuery}`,
      ))
      .orderBy(sql`rank DESC`)
      .limit(maxLimit);

    msgHits.forEach(m => hits.push(m));
  }

  // Sort by rank descending (already ordered per-query, but combine and re-sort)
  hits.sort((a, b) => Number(b.rank) - Number(a.rank));
  return { hits: hits.slice(0, maxLimit) };
}