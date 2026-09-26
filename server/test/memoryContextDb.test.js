import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initDb, getDb, closeDb } from '../src/db/index.js';
import { users, projects, memories } from '../src/db/schema.js';
import { appendMemoryContext } from '../src/routes/chat/helpers.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe('appendMemoryContext: PostgreSQL recall', { skip: !databaseUrl }, () => {
  before(() => { initDb(databaseUrl); });
  after(async () => { await closeDb(); });

  test('isolates owners and projects, excludes disabled and mislabeled rows, and orders newest first', async () => {
    const rollback = Symbol('rollback');
    try {
      await getDb().transaction(async (db) => {
        const userId = randomUUID();
        const otherUserId = randomUUID();
        const projectId = randomUUID();
        const otherProjectId = randomUUID();
        const base = new Date('2026-01-01T00:00:00Z').getTime();
        await db.insert(users).values([
          { id: userId, email: `memory-${userId}@test.local`, passwordHash: 'test' },
          { id: otherUserId, email: `memory-${otherUserId}@test.local`, passwordHash: 'test' },
        ]);
        await db.insert(projects).values([
          { id: projectId, userId, name: 'Current' },
          { id: otherProjectId, userId, name: 'Other' },
        ]);
        await db.insert(memories).values([
          { userId, text: 'older global fact', scope: 'global', createdAt: new Date(base) },
          { userId, text: 'newer project fact', scope: 'project', projectId, createdAt: new Date(base + 1000) },
          { userId, text: 'other project secret', scope: 'project', projectId: otherProjectId, createdAt: new Date(base + 2000) },
          { userId, text: 'disabled fact', scope: 'global', enabled: false, createdAt: new Date(base + 3000) },
          { otherUserId, text: 'other user secret', scope: 'global', createdAt: new Date(base + 4000) },
          { userId, text: 'mislabeled project fact', scope: 'other', projectId, createdAt: new Date(base + 5000) },
        ]);
        const messages = [{ role: 'system', content: 'Base' }, { role: 'user', content: 'Hello' }];
        const scoped = await appendMemoryContext(messages, userId, projectId, db);
        assert.match(scoped[0].content, /newer project fact[\s\S]*older global fact/);
        for (const excluded of ['other project secret', 'disabled fact', 'other user secret', 'mislabeled project fact']) {
          assert.doesNotMatch(scoped[0].content, new RegExp(excluded));
        }
        const globalOnly = await appendMemoryContext(messages, userId, undefined, db);
        assert.match(globalOnly[0].content, /older global fact/);
        assert.doesNotMatch(globalOnly[0].content, /newer project fact/);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
