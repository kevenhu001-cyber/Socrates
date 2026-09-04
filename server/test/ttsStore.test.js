// @ts-check
/**
 * Unit + integration tests for services/ttsStore.ts — the durable
 * per-message TTS persistence layer (M4 follow-up).
 *
 * Pure part: `ttsTextHash` is exercised in isolation, mirroring the
 * style of ttsCache.test.js.
 *
 * Integration part: `lookupTtsResult` / `saveTtsResult` /
 * `invalidateForMessage` need a real Postgres reachable via
 * DATABASE_URL. We follow the loginLockout.test.js pattern: probe
 * the DB at suite start, set `dbAvailable`, and skip each
 * integration test gracefully when the probe fails so the test
 * suite still runs in environments without a live database.
 *
 * Run with: npm test
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { initDb, getDb, closeDb } from '../src/db/index.js';
import { messages, sessions, users, ttsResults } from '../src/db/schema.js';
import {
  ttsTextHash,
  lookupTtsResult,
  saveTtsResult,
  invalidateForMessage,
} from '../src/services/ttsStore.js';
import { runExpiredCleanup } from '../src/services/cleanupDb.js';

/* ── Pure part: ttsTextHash ────────────────────────────────────── */

describe('ttsStore.ttsTextHash', () => {
  test('hashes the trimmed text only — leading / trailing whitespace is dropped', () => {
    const a = ttsTextHash('  hello world  ');
    const b = ttsTextHash('hello world');
    assert.equal(a, b);
  });

  test('is sha256-hex (64 hex chars)', () => {
    const h = ttsTextHash('hello world');
    assert.equal(h.length, 64);
    assert.match(h, /^[0-9a-f]{64}$/);
  });

  test('empty / whitespace-only input hashes to a stable value', () => {
    assert.equal(ttsTextHash(''), ttsTextHash('   '));
    assert.equal(ttsTextHash('').length, 64);
  });

  test('different texts hash differently', () => {
    assert.notEqual(ttsTextHash('hello'), ttsTextHash('Hello'));
    assert.notEqual(ttsTextHash('hello'), ttsTextHash('hello!'));
  });
});

/* ── Integration part: DB-backed lookup / save / invalidate ────── */

let dbAvailable = false;
const TEST_USER_ID = '00000000-0000-0000-0000-0000000000a1';
const TEST_OTHER_USER_ID = '00000000-0000-0000-0000-0000000000a2';
const TEST_SESSION_ID = '00000000-0000-0000-0000-0000000000b1';
const TEST_OTHER_SESSION_ID = '00000000-0000-0000-0000-0000000000b2';
const TEST_MESSAGE_ID = '00000000-0000-0000-0000-0000000000c1';
const TEST_OTHER_MESSAGE_ID = '00000000-0000-0000-0000-0000000000c2';

before(async () => {
  if (!process.env.DATABASE_URL) {
    console.log('[ttsStore] DATABASE_URL not set — skipping integration tests');
    return;
  }
  try {
    initDb(process.env.DATABASE_URL);
    const db = getDb();
    /* Probe: do the new tts_results columns and FK exist? If the
       migration has not been applied, the integration tests would
       noise-fail on every assertion. */
    await db.select().from(ttsResults).limit(0);
    /* Seed the two sessions / two messages the tests need. Use raw
       inserts with known UUIDs so the assertions are stable; rely on
       the FK to messages for the tts_results rows. The seed is
       wrapped in try / catch because the integration suite is
       shared with concurrent runs on the dev DB. */
    try {
      await db.insert(users).values([
        { id: TEST_USER_ID, email: 'ttsstore-' + Date.now() + '-a@test.local', passwordHash: 'x' },
        { id: TEST_OTHER_USER_ID, email: 'ttsstore-' + Date.now() + '-b@test.local', passwordHash: 'x' },
      ]).onConflictDoNothing();
      await db.insert(sessions).values([
        { id: TEST_SESSION_ID, userId: TEST_USER_ID, title: 'tts-store-a' },
        { id: TEST_OTHER_SESSION_ID, userId: TEST_OTHER_USER_ID, title: 'tts-store-b' },
      ]).onConflictDoNothing();
      await db.insert(messages).values([
        {
          id: TEST_MESSAGE_ID, sessionId: TEST_SESSION_ID, role: 'assistant',
          content: '<p>hi</p>', rawText: 'hi',
        },
        {
          id: TEST_OTHER_MESSAGE_ID, sessionId: TEST_OTHER_SESSION_ID, role: 'assistant',
          content: '<p>other</p>', rawText: 'other',
        },
      ]).onConflictDoNothing();
    } catch (seedErr) {
      console.log('[ttsStore] seed insert skipped:', (seedErr).message);
    }
    dbAvailable = true;
  } catch (err) {
    console.log('[ttsStore] DB not reachable — skipping integration tests:', err.message);
  }
});

after(async () => {
  if (!dbAvailable) return;
  try {
    const db = getDb();
    await db.delete(ttsResults).where(eq(ttsResults.messageId, TEST_MESSAGE_ID));
    await db.delete(messages).where(eq(messages.id, TEST_MESSAGE_ID));
    await db.delete(sessions).where(eq(sessions.id, TEST_SESSION_ID));
    await db.delete(users).where(eq(users.id, TEST_USER_ID));
    await db.delete(ttsResults).where(eq(ttsResults.messageId, TEST_OTHER_MESSAGE_ID));
    await db.delete(messages).where(eq(messages.id, TEST_OTHER_MESSAGE_ID));
    await db.delete(sessions).where(eq(sessions.id, TEST_OTHER_SESSION_ID));
    await db.delete(users).where(eq(users.id, TEST_OTHER_USER_ID));
  } catch (_) { /* best effort */ }
  await closeDb();
});

describe('ttsStore.lookupTtsResult — DB integration', () => {
  test('returns null when the message is not owned by the caller', async (t) => {
    if (!dbAvailable) return t.skip();
    const result = await lookupTtsResult(
      TEST_OTHER_MESSAGE_ID, TEST_USER_ID, 'alloy', 'mp3', 'en', ttsTextHash('hi'),
    );
    assert.equal(result, null);
  });

  test('returns null when no row exists for the (message, voice, format, lang) tuple', async (t) => {
    if (!dbAvailable) return t.skip();
    const result = await lookupTtsResult(
      TEST_MESSAGE_ID, TEST_USER_ID, 'alloy', 'mp3', 'en', ttsTextHash('hi'),
    );
    assert.equal(result, null);
  });

  test('round-trips a saved row, returning the persisted bytes', async (t) => {
    if (!dbAvailable) return t.skip();
    const audio = Buffer.from('audio-bytes-mp3');
    const textHash = ttsTextHash('round-trip text');
    await saveTtsResult(
      TEST_MESSAGE_ID, TEST_USER_ID, 'alloy', 'mp3', 'en', textHash, audio, 'audio/mpeg',
    );
    const result = await lookupTtsResult(
      TEST_MESSAGE_ID, TEST_USER_ID, 'alloy', 'mp3', 'en', textHash,
    );
    assert.ok(result, 'expected a row to be returned');
    assert.equal(result.contentType, 'audio/mpeg');
    assert.equal(result.textHash, textHash);
    assert.equal(result.byteSize, audio.length);
    assert.deepEqual(result.audio, audio);
  });

  test('treats a stale textHash as a miss (no leak of outdated bytes)', async (t) => {
    if (!dbAvailable) return t.skip();
    const audio = Buffer.from('first-version-bytes');
    await saveTtsResult(
      TEST_MESSAGE_ID, TEST_USER_ID, 'alloy', 'mp3', 'en', ttsTextHash('v1'), audio, 'audio/mpeg',
    );
    const result = await lookupTtsResult(
      TEST_MESSAGE_ID, TEST_USER_ID, 'alloy', 'mp3', 'en', ttsTextHash('v2'),
    );
    assert.equal(result, null);
  });
});

describe('ttsStore.saveTtsResult — owner enforcement + upsert', () => {
  test('refuses to write a row for a message the caller does not own', async (t) => {
    if (!dbAvailable) return t.skip();
    const db = getDb();
    await saveTtsResult(
      TEST_OTHER_MESSAGE_ID, TEST_USER_ID, 'alloy', 'mp3', 'en',
      ttsTextHash('attempted-forge'), Buffer.from('should-not-persist'), 'audio/mpeg',
    );
    const [row] = await db.select().from(ttsResults)
      .where(eq(ttsResults.messageId, TEST_OTHER_MESSAGE_ID));
    assert.equal(row, undefined, 'a forged id must not leave a row in tts_results');
  });

  test('upsert replaces the existing row when the (message, voice, format, lang) key matches', async (t) => {
    if (!dbAvailable) return t.skip();
    const db = getDb();
    const first = Buffer.from('first');
    const second = Buffer.from('second-larger');
    await saveTtsResult(
      TEST_MESSAGE_ID, TEST_USER_ID, 'alloy', 'mp3', 'en',
      ttsTextHash('shape-stable'), first, 'audio/mpeg',
    );
    await saveTtsResult(
      TEST_MESSAGE_ID, TEST_USER_ID, 'alloy', 'mp3', 'en',
      ttsTextHash('shape-stable-v2'), second, 'audio/mp3',
    );
    const rows = await db.select().from(ttsResults)
      .where(and(
        eq(ttsResults.messageId, TEST_MESSAGE_ID),
        eq(ttsResults.voice, 'alloy'),
        eq(ttsResults.format, 'mp3'),
        eq(ttsResults.lang, 'en'),
      ));
    assert.equal(rows.length, 1, 'unique key collapses successive inserts');
    assert.deepEqual(rows[0].audio, second);
    assert.equal(rows[0].contentType, 'audio/mp3');
    assert.equal(rows[0].byteSize, second.length);
  });
});

describe('ttsStore.invalidateForMessage — stale-on-edit eviction', () => {
  test('drops only rows whose textHash no longer matches the current text', async (t) => {
    if (!dbAvailable) return t.skip();
    const db = getDb();
    /* Pre-seed two rows for the same message in different shapes. */
    await saveTtsResult(
      TEST_MESSAGE_ID, TEST_USER_ID, 'alloy', 'mp3', 'en',
      ttsTextHash('same'), Buffer.from('same-shape'), 'audio/mpeg',
    );
    await saveTtsResult(
      TEST_MESSAGE_ID, TEST_USER_ID, 'alloy', 'mp3', 'zh',
      ttsTextHash('diff'), Buffer.from('different-shape'), 'audio/mpeg',
    );
    /* After the message is edited, the tts helper will compute
       ttsTextHash(newText). We pass 'same' so the first row stays. */
    await invalidateForMessage(TEST_MESSAGE_ID, ttsTextHash('same'));
    const rows = await db.select().from(ttsResults)
      .where(eq(ttsResults.messageId, TEST_MESSAGE_ID));
    assert.equal(rows.length, 1, 'only the matching-text row survives');
    assert.equal(rows[0].lang, 'zh', 'the non-matching row was dropped');
  });
});

/* ── Cleanup sweep (M4 follow-up: 30-day retention) ─────────────── */

describe('cleanupDb.runExpiredCleanup — tts_results retention sweep', () => {
  test('drops tts_results rows older than TTS_RETENTION_DAYS, keeps recent ones', async (t) => {
    if (!dbAvailable) return t.skip();
    const db = getDb();

    /* Backdate one row so the sweep sees it as expired. The
       default retention is 30 days, so 60 days back is well past
       the cutoff. We bypass saveTtsResult for the seeded row
       because the helper stamps createdAt = now(). */
    const audio = Buffer.from('ancient-audio');
    const [{ id: ancientId }] = await db.insert(ttsResults).values({
      messageId: TEST_MESSAGE_ID,
      voice: 'alloy',
      format: 'mp3',
      lang: 'en',
      textHash: ttsTextHash('ancient'),
      audio,
      contentType: 'audio/mpeg',
      byteSize: audio.length,
      createdAt: new Date(Date.now() - 60 * 86400000),
    }).returning({ id: ttsResults.id });
    /* And one fresh row that must survive. */
    const fresh = Buffer.from('fresh-audio');
    await saveTtsResult(
      TEST_MESSAGE_ID, TEST_USER_ID, 'alloy', 'mp3', 'en',
      ttsTextHash('fresh'), fresh, 'audio/mpeg',
    );

    await runExpiredCleanup();

    const remaining = await db.select().from(ttsResults)
      .where(eq(ttsResults.messageId, TEST_MESSAGE_ID));
    const ids = remaining.map((r) => r.id);
    assert.ok(!ids.includes(ancientId), 'ancient row was reaped');
    const freshRow = remaining.find((r) => r.textHash === ttsTextHash('fresh'));
    assert.ok(freshRow, 'fresh row survived the sweep');
  });
});
