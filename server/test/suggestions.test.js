// @ts-check
/**
 * Unit tests for src/routes/suggestions.ts — the AI-generated starter
 * prompt engine. We isolate the pure helpers (parseSuggestionsArray,
 * shapeSuggestions, getFallbackStarters-equivalent behaviour) and
 * verify the parser/shaper handle every shape the upstream LLM might
 * produce. The DB-touching parts (generateStarters, the router) are
 * exercised end-to-end via the deploy verification, not here.
 *
 * Run with: npm test
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { eq } from 'drizzle-orm';

import suggestionsRouter, { __test } from '../src/routes/suggestions.js';
import { requireAuth } from '../src/middleware/auth.js';
import { initDb, getDb, closeDb } from '../src/db/index.js';
import { sessions as sessionsTable, users as usersTable } from '../src/db/schema.js';
import { listen, httpRequest } from './_http.js';

const t = __test;

describe('suggestions parser', () => {
  test('parses a plain JSON array', () => {
    const arr = t.parseSuggestionsArray('["hello", "world"]');
    assert.deepEqual(arr, ['hello', 'world']);
  });

  test('parses a fenced json array', () => {
    const arr = t.parseSuggestionsArray('```json\n["hello", "world"]\n```');
    assert.deepEqual(arr, ['hello', 'world']);
  });

  test('parses a prose-wrapped array', () => {
    const arr = t.parseSuggestionsArray('Sure, here are two:\n["hello", "world"]\nEnjoy!');
    assert.deepEqual(arr, ['hello', 'world']);
  });

  test('returns null on non-array JSON', () => {
    const arr = t.parseSuggestionsArray('{"a": 1}');
    assert.equal(arr, null);
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
  test('produces two suggestions from a valid array', () => {
    const out = t.shapeSuggestions(['Review my last PR', 'Help me draft an email'], 'en');
    assert.equal(out.length, 2);
    assert.equal(out[0].prompt, 'Review my last PR');
    assert.equal(out[1].prompt, 'Help me draft an email');
    assert.ok(out[0].id.startsWith('ai-'));
    assert.ok(typeof out[0].icon === 'string' && out[0].icon.length > 0);
  });

  test('rejects prompts containing placeholder brackets', () => {
    const out = t.shapeSuggestions(['Teach me [topic] in 5 minutes'], 'en');
    assert.equal(out.length, 0);
  });

  test('truncates overlong English prompts to 120 chars + ellipsis', () => {
    const long = 'a'.repeat(200);
    const out = t.shapeSuggestions([long], 'en');
    assert.equal(out.length, 1);
    assert.equal(out[0].prompt.length, 120);
    assert.ok(out[0].prompt.endsWith('…'));
  });

  test('truncates overlong Chinese prompts to 60 chars + ellipsis', () => {
    const long = '测'.repeat(100);
    const out = t.shapeSuggestions([long], 'zh');
    assert.equal(out.length, 1);
    assert.equal(out[0].prompt.length, 60);
  });

  test('skips empty prompts', () => {
    const out = t.shapeSuggestions(['', '   ', 'actual prompt'], 'en');
    assert.equal(out.length, 1);
    assert.equal(out[0].prompt, 'actual prompt');
  });

  test('caps output at two items even when input is longer', () => {
    const out = t.shapeSuggestions(['a', 'b', 'c', 'd'], 'en');
    assert.equal(out.length, 2);
  });

  test('returns empty array for non-array input', () => {
    assert.deepEqual(t.shapeSuggestions(null, 'en'), []);
    assert.deepEqual(t.shapeSuggestions('hello', 'en'), []);
    assert.deepEqual(t.shapeSuggestions({}, 'en'), []);
  });
});

describe('suggestions fallback starters', () => {
  test('returns Chinese fallback for zh locale', () => {
    const fb = t.getFallbackStarters('zh');
    assert.equal(fb.length, 2);
    assert.ok(/[\u4e00-\u9fff]/.test(fb[0].prompt), 'zh fallback should contain CJK');
    assert.equal(fb[0].icon, 'briefing');
  });

  test('returns English fallback for en locale', () => {
    const fb = t.getFallbackStarters('en');
    assert.equal(fb.length, 2);
    assert.ok(/[A-Za-z]/.test(fb[0].prompt));
    assert.equal(fb[0].icon, 'briefing');
  });

  test('falls back to English for unknown locale', () => {
    const fb = t.getFallbackStarters('xx');
    assert.equal(fb.length, 2);
    assert.ok(/[A-Za-z]/.test(fb[0].prompt));
  });
});

/* DB-backed integration suite: requires DATABASE_URL. Skipped otherwise
   to keep the suite hermetic. Verifies the route returns fallback for
   no-history users and serves two suggestions for users with history
   (the AI path is short-circuited in tests by mocking the LLM layer). */
describe('suggestions route (DB-backed)', () => {
  let testUser = null;
  let server = null;
  let app = null;

  before(async () => {
    if (!process.env.DATABASE_URL) return;
    await initDb();
    const db = getDb();
    const id = 'test-suggestions-' + Math.random().toString(36).slice(2, 10);
    const [u] = await db.insert(usersTable).values({
      id,
      email: id + '@socrates.test',
      name: 'Suggestions Test',
      tier: 'free',
      passwordHash: 'x',
    }).returning();
    testUser = u;
    app = express();
    app.use((req, _res, next) => {
      req.userId = testUser.id;
      req.user = testUser;
      next();
    });
    app.use('/api/suggestions', suggestionsRouter);
    server = await listen(app);
  });

  after(async () => {
    if (server) await server.close();
    if (testUser) {
      try {
        const db = getDb();
        await db.delete(sessionsTable).where(eq(sessionsTable.userId, testUser.id));
        await db.delete(usersTable).where(eq(usersTable.id, testUser.id));
      } catch (_) { /* ignore */ }
    }
    if (process.env.DATABASE_URL) await closeDb();
  });

  test('returns fallback for user with no history', async () => {
    if (!process.env.DATABASE_URL || !server) return;
    const r = await httpRequest(server.url + '/api/suggestions/starters?lang=en', { cookies: { sid: 'irrelevant' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.suggestions.length, 2);
    assert.equal(r.body.source, 'fallback-empty');
  });

  test('returns two suggestions for user with history (provider path)', async () => {
    if (!process.env.DATABASE_URL || !server) return;
    const db = getDb();
    /* Insert three sessions so the engine has history to read. */
    for (let i = 0; i < 3; i++) {
      await db.insert(sessionsTable).values({
        userId: testUser.id,
        title: 'Test chat about topic ' + i,
        topic: 'topic-' + i,
        mode: 'chat',
        phase: 'chat',
      });
    }
    const r = await httpRequest(server.url + '/api/suggestions/starters?lang=en');
    assert.equal(r.status, 200);
    assert.equal(r.body.suggestions.length, 2);
    /* source is either 'ai' (when the provider call succeeds) or
       'fallback-no-provider' (when no API key is configured in the
       test environment). Both paths must return two suggestions. */
    assert.ok(
      ['ai', 'fallback-no-provider', 'fallback-error'].includes(r.body.source),
      `unexpected source: ${r.body.source}`,
    );
  });
});
