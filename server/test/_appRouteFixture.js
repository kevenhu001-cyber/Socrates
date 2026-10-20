// @ts-check
import assert from 'node:assert/strict';
import { before, after } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { inArray, sql } from 'drizzle-orm';
import app from '../src/app.js';
import { initDb, getDb, closeDb } from '../src/db/index.js';
import { users, authSessions } from '../src/db/schema/index.js';
import { shutdownPubsub } from '../src/lib/pubsub.js';
import { listen, httpRequest } from './_http.js';

/** Real app, real credentials and database; each file owns fresh users. */
export function appRouteFixture() {
  const fixture = { app, db: null, owner: null, other: null, url: '', request: null };
  let server;
  const createdIds = [];
  before(async () => {
    assert.ok(process.env.DATABASE_URL, 'app route integration tests require DATABASE_URL; never silently skip');
    fixture.db = initDb(process.env.DATABASE_URL);
    // Match strict CI's migrated pgvector schema instead of testing a degraded DB.
    await fixture.db.execute(sql`SELECT embedding FROM session_chunks LIMIT 0`);
    for (const key of ['owner', 'other']) {
      const [user] = await fixture.db.insert(users).values({
        email: `route-${randomUUID()}@invalid.test`,
        passwordHash: 'test-only-not-a-real-password-hash',
        verifiedAt: new Date(),
      }).returning();
      createdIds.push(user.id);
      const sid = randomBytes(32).toString('hex');
      const csrf = randomBytes(32).toString('hex');
      await fixture.db.insert(authSessions).values({
        userId: user.id, token: sid, expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      fixture[key] = { ...user, sid, csrf };
    }
    server = await listen(app);
    fixture.url = server.url;
    fixture.request = (path, { as = fixture.owner, headers = {}, ...options } = {}) => httpRequest(`${fixture.url}${path}`, {
      ...options,
      headers: { ...(as ? { 'X-CSRF-Token': as.csrf } : {}), ...headers },
      cookies: as ? { sid: as.sid, csrf: as.csrf } : undefined,
    });
  });
  after(async () => {
    try {
      if (server) await server.close();
      if (createdIds.length) await getDb().delete(users).where(inArray(users.id, createdIds));
    } finally {
      await shutdownPubsub();
      await closeDb();
    }
  });
  return fixture;
}
