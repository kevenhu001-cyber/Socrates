// @ts-check
/**
 * Unit tests for src/routes/suggestions.ts.
 *
 * The landing suggestions are a strict three-item contract: no fallback,
 * no partial render, and no suggestions without history + the built-in
 * Beagle provider.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express from 'express';
import { eq } from 'drizzle-orm';

import suggestionsRouter, { __test } from '../src/routes/suggestions.js';
import { initDb, getDb, closeDb } from '../src/db/index.js';
import { authSessions as authSessionsTable, sessions as sessionsTable, users as usersTable } from '../src/db/schema.js';
import { listen, httpRequest } from './_http.js';

const t = __test;

describe('suggestions parser', () => {
  test('parses a plain JSON array', () => {
    const arr = t.parseSuggestionsArray('["hello", "world", "again"]');
    assert.deepEqual(arr, ['hello', 'world', 'again']);
  });

  test('parses a fenced json array', () => {
    const arr = t.parseSuggestionsArray('```json\n["hello", "world", "again"]\n```');
    assert.deepEqual(arr, ['hello', 'world', 'again']);
  });

  test('parses a prose-wrapped array', () => {
    const arr = t.parseSuggestionsArray('Sure, here are three:\n["hello", "world", "again"]\nEnjoy!');
    assert.deepEqual(arr, ['hello', 'world', 'again']);
  });

  test('returns null on non-array JSON', () => {
    assert.equal(t.parseSuggestionsArray('{"a": 1}'), null);
  });

  test('returns null on garbage input', () => {
    assert.equal(t.parseSuggestionsArray('not json'), null);
    assert.equal(t.parseSuggestionsArray(''), null);
    assert.equal(t.parseSuggestionsArray(null), null);
    assert.equal(t.parseSuggestionsArray(undefined), null);
  });

  test('returns null on nested malformed array', () => {
    assert.equal(t.parseSuggestionsArray('[hello, world'), null);
  });
});

describe('suggestions shaper', () => {
  test('produces exactly three suggestions from a valid array', () => {
    const out = t.shapeSuggestions(['Review my last PR', 'Help me draft an email', 'Plan tomorrow'], 'en');
    assert.equal(out.length, 3);
    assert.equal(out[0].prompt, 'Review my last PR');
    assert.equal(out[2].prompt, 'Plan tomorrow');
    assert.ok(out[0].id.startsWith('ai-'));
    assert.deepEqual(out.map((item) => item.icon), ['spark', 'history', 'target']);
  });

  test('rejects arrays that do not contain exactly three prompts', () => {
    assert.equal(t.shapeSuggestions(['one', 'two'], 'en').length, 0);
    assert.equal(t.shapeSuggestions(['one', 'two', 'three', 'four'], 'en').length, 0);
  });

  test('rejects prompts containing placeholder brackets', () => {
    assert.equal(t.shapeSuggestions(['Teach me [topic] in 5 minutes', 'two', 'three'], 'en').length, 0);
  });

  test('rejects overlong prompts instead of truncating them', () => {
    const long = 'a'.repeat(200);
    assert.equal(t.shapeSuggestions([long, 'two', 'three'], 'en').length, 0);
  });

  test('rejects emoji in generated prompts', () => {
    assert.equal(t.shapeSuggestions(['Plan my week 🚀', 'two', 'three'], 'en').length, 0);
  });

  test('rejects duplicate prompts', () => {
    assert.equal(t.shapeSuggestions(['same prompt', 'same prompt', 'third prompt'], 'en').length, 0);
  });

  test('returns empty array for non-array input', () => {
    assert.deepEqual(t.shapeSuggestions(null, 'en'), []);
    assert.deepEqual(t.shapeSuggestions('hello', 'en'), []);
    assert.deepEqual(t.shapeSuggestions({}, 'en'), []);
  });
});

describe('suggestions prompt context', () => {
  test('includes history, preferences, and memories in the model prompt', () => {
    const messages = t.buildPromptMessages({
      recentSessions: [{ title: 'Rust async runtime', topic: 'rust', mode: 'chat' }],
      recentMessages: [{ role: 'user', content: 'I am comparing Tokio and async-std.' }],
      customInstructions: 'Prefer concise examples.',
      preferences: { language: 'zh' },
      memories: ['The user is learning systems programming.'],
    }, 'en');
    const combined = messages.map((message) => message.content).join('\n');
    assert.match(combined, /Rust async runtime/);
    assert.match(combined, /Tokio and async-std/);
    assert.match(combined, /Prefer concise examples/);
    assert.match(combined, /systems programming/);
    assert.match(combined, /exactly three/i);
  });
});

/* DB-backed integration suite: requires DATABASE_URL. Skipped otherwise.
   Verifies the route returns an empty list for no-history users and only
   ever returns 0 or exactly 3 suggestions for users with history. */
describe('suggestions route (DB-backed)', () => {
  let testUser = null;
  let testSid = null;
  let server = null;
  let app = null;

  before(async () => {
    if (!process.env.DATABASE_URL) return;
    await initDb(process.env.DATABASE_URL);
    const db = getDb();
    const id = randomUUID();
    const [u] = await db.insert(usersTable).values({
      id,
      email: id + '@socrates.test',
      displayName: 'Suggestions Test',
      tier: 'free',
      passwordHash: 'x',
    }).returning();
    testUser = u;
    testSid = randomBytes(32).toString('hex');
    await db.insert(authSessionsTable).values({
      token: testSid,
      userId: testUser.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    app = express();
    app.use(cookieParser());
    app.use('/api/suggestions', suggestionsRouter);
    server = await listen(app);
  });

  after(async () => {
    if (server) await server.close();
    if (testUser) {
      try {
        const db = getDb();
        await db.delete(sessionsTable).where(eq(sessionsTable.userId, testUser.id));
        await db.delete(authSessionsTable).where(eq(authSessionsTable.userId, testUser.id));
        await db.delete(usersTable).where(eq(usersTable.id, testUser.id));
      } catch (_) { /* ignore */ }
    }
    if (process.env.DATABASE_URL) await closeDb();
  });

  test('returns an empty list for a user with no history', async () => {
    if (!process.env.DATABASE_URL || !server) return;
    const r = await httpRequest(server.url + '/api/suggestions/starters?lang=en', { cookies: { sid: testSid } });
    assert.equal(r.status, 200);
    assert.equal(r.body.suggestions.length, 0);
    assert.equal(r.body.source, 'empty-no-history');
  });

  test('returns either exactly three valid suggestions or an empty result', async () => {
    if (!process.env.DATABASE_URL || !server) return;
    const db = getDb();
    for (let i = 0; i < 3; i++) {
      await db.insert(sessionsTable).values({
        userId: testUser.id,
        title: 'Test chat about topic ' + i,
        topic: 'topic-' + i,
        mode: 'chat',
        phase: 'chat',
      });
    }
    const inv = await httpRequest(server.url + '/api/suggestions/starters/invalidate', {
      method: 'POST',
      cookies: { sid: testSid },
    });
    assert.equal(inv.status, 200);
    const r = await httpRequest(server.url + '/api/suggestions/starters?lang=en', { cookies: { sid: testSid } });
    assert.equal(r.status, 200);
    assert.ok(r.body.suggestions.length === 0 || r.body.suggestions.length === 3);
    if (r.body.suggestions.length === 3) assert.equal(r.body.source, 'ai');
  });
});
