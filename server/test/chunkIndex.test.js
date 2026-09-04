// @ts-check
/**
 * Unit + integration tests for services/chunkIndex.ts — the durable
 * per-message chunk index + session-scoped BM25 retrieval (LobeHub
 * M3 deferred).
 *
 * Pure part: the index reuses `services/rag.ts` (chunkText /
 * buildRagIndex / searchRagIndex) which is already covered by
 * rag.test.js. The integration block here pins the new contract:
 * the index lookup hits a real DB.
 *
 * Integration: requires Postgres reachable via DATABASE_URL.
 * Follows the loginLockout.test.js pattern — probe DB at start, set
 * `dbAvailable`, skip each test gracefully when the probe fails.
 *
 * Run with: npm test
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and } from 'drizzle-orm';
import { initDb, getDb, closeDb } from '../src/db/index.js';
import { users, sessions, messages, sessionChunks } from '../src/db/schema.js';
import {
  indexMessageChunks,
  searchSessionChunks,
  removeMessageChunks,
  sessionOwnedBy,
} from '../src/services/chunkIndex.js';

let dbAvailable = false;
const TEST_USER_ID = '00000000-0000-0000-0000-0000000000a3';
const TEST_OTHER_USER_ID = '00000000-0000-0000-0000-0000000000a4';
const TEST_SESSION_ID = '00000000-0000-0000-0000-0000000000b3';
const TEST_OTHER_SESSION_ID = '00000000-0000-0000-0000-0000000000b4';
const TEST_MESSAGE_ID = '00000000-0000-0000-0000-0000000000c3';
const TEST_OTHER_MESSAGE_ID = '00000000-0000-0000-0000-0000000000c4';

before(async () => {
  if (!process.env.DATABASE_URL) {
    console.log('[chunkIndex] DATABASE_URL not set — skipping integration tests');
    return;
  }
  try {
    initDb(process.env.DATABASE_URL);
    const db = getDb();
    /* Probe the new table so the suite skips when the migration
       has not been applied (the integration tests would noise-fail
       otherwise). */
    await db.select().from(sessionChunks).limit(0);
    /* Seed the two sessions / two messages the tests need. */
    try {
      await db.insert(users).values([
        { id: TEST_USER_ID, email: 'chunkindex-' + Date.now() + '-a@test.local', passwordHash: 'x' },
        { id: TEST_OTHER_USER_ID, email: 'chunkindex-' + Date.now() + '-b@test.local', passwordHash: 'x' },
      ]).onConflictDoNothing();
      await db.insert(sessions).values([
        { id: TEST_SESSION_ID, userId: TEST_USER_ID, title: 'chunkindex-a' },
        { id: TEST_OTHER_SESSION_ID, userId: TEST_OTHER_USER_ID, title: 'chunkindex-b' },
      ]).onConflictDoNothing();
      await db.insert(messages).values([
        {
          id: TEST_MESSAGE_ID, sessionId: TEST_SESSION_ID, role: 'assistant',
          content: '<p>index target</p>', rawText: 'index target',
        },
        {
          id: TEST_OTHER_MESSAGE_ID, sessionId: TEST_OTHER_SESSION_ID, role: 'assistant',
          content: '<p>other target</p>', rawText: 'other target',
        },
      ]).onConflictDoNothing();
    } catch (seedErr) {
      console.log('[chunkIndex] seed insert skipped:', (seedErr).message);
    }
    dbAvailable = true;
  } catch (err) {
    console.log('[chunkIndex] DB not reachable — skipping integration tests:', err.message);
  }
});

after(async () => {
  if (!dbAvailable) return;
  try {
    const db = getDb();
    await db.delete(sessionChunks).where(eq(sessionChunks.messageId, TEST_MESSAGE_ID));
    await db.delete(messages).where(eq(messages.id, TEST_MESSAGE_ID));
    await db.delete(sessions).where(eq(sessions.id, TEST_SESSION_ID));
    await db.delete(users).where(eq(users.id, TEST_USER_ID));
    await db.delete(sessionChunks).where(eq(sessionChunks.messageId, TEST_OTHER_MESSAGE_ID));
    await db.delete(messages).where(eq(messages.id, TEST_OTHER_MESSAGE_ID));
    await db.delete(sessions).where(eq(sessions.id, TEST_OTHER_SESSION_ID));
    await db.delete(users).where(eq(users.id, TEST_OTHER_USER_ID));
  } catch (_) { /* best effort */ }
  await closeDb();
});

describe('chunkIndex.sessionOwnedBy', () => {
  test('returns true for the owner, false for anyone else', async (t) => {
    if (!dbAvailable) return t.skip();
    assert.equal(await sessionOwnedBy(TEST_SESSION_ID, TEST_USER_ID), true);
    assert.equal(await sessionOwnedBy(TEST_SESSION_ID, TEST_OTHER_USER_ID), false);
  });
});

describe('chunkIndex.indexMessageChunks', () => {
  test('writes one row per chunk and is idempotent on re-index', async (t) => {
    if (!dbAvailable) return t.skip();
    const db = getDb();
    /* Two short paragraphs, each becomes one chunk. */
    const text = 'The Eiffel Tower is in Paris, France.\n\nPhotosynthesis happens in plant leaves.';
    const chunks1 = await indexMessageChunks(TEST_MESSAGE_ID, TEST_SESSION_ID, text);
    assert.ok(chunks1.length >= 2);
    const rows1 = await db.select().from(sessionChunks)
      .where(eq(sessionChunks.messageId, TEST_MESSAGE_ID));
    assert.equal(rows1.length, chunks1.length);

    /* Re-indexing the same message replaces the rows (same set,
       same count) — never grows unbounded. */
    const chunks2 = await indexMessageChunks(TEST_MESSAGE_ID, TEST_SESSION_ID, text);
    assert.equal(chunks2.length, chunks1.length);
    const rows2 = await db.select().from(sessionChunks)
      .where(eq(sessionChunks.messageId, TEST_MESSAGE_ID));
    assert.equal(rows2.length, chunks1.length, 're-index collapsed to the same row count');
  });

  test('re-indexing with a different text drops the stale rows', async (t) => {
    if (!dbAvailable) return t.skip();
    const db = getDb();
    await indexMessageChunks(TEST_MESSAGE_ID, TEST_SESSION_ID, 'original text');
    const before = await db.select().from(sessionChunks)
      .where(eq(sessionChunks.messageId, TEST_MESSAGE_ID));
    assert.equal(before.length, 1);
    const originalOrdinal = before[0].ordinal;

    await indexMessageChunks(TEST_MESSAGE_ID, TEST_SESSION_ID, 'completely new content with several words');
    const after = await db.select().from(sessionChunks)
      .where(eq(sessionChunks.messageId, TEST_MESSAGE_ID));
    assert.equal(after.length, 1, 're-index kept exactly one row');
    assert.notEqual(after[0].text, before[0].text, 'row reflects the new text');
    /* The ordinal of a single-chunk message is 0; the new text
       becomes the only row. */
    assert.equal(after[0].ordinal, 0);
    assert.equal(after[0].ordinal, originalOrdinal);
  });

  test('whitespace-only input clears any existing rows', async (t) => {
    if (!dbAvailable) return t.skip();
    const db = getDb();
    await indexMessageChunks(TEST_MESSAGE_ID, TEST_SESSION_ID, 'something to keep');
    const before = await db.select().from(sessionChunks)
      .where(eq(sessionChunks.messageId, TEST_MESSAGE_ID));
    assert.ok(before.length > 0);
    await indexMessageChunks(TEST_MESSAGE_ID, TEST_SESSION_ID, '   ');
    const after = await db.select().from(sessionChunks)
      .where(eq(sessionChunks.messageId, TEST_MESSAGE_ID));
    assert.equal(after.length, 0);
  });
});

describe('chunkIndex.removeMessageChunks', () => {
  test('drops only the rows for the given message', async (t) => {
    if (!dbAvailable) return t.skip();
    const db = getDb();
    await indexMessageChunks(TEST_MESSAGE_ID, TEST_SESSION_ID, 'a message we will clean up');
    await indexMessageChunks(TEST_OTHER_MESSAGE_ID, TEST_OTHER_SESSION_ID, 'other user message');
    await removeMessageChunks(TEST_MESSAGE_ID);
    const a = await db.select().from(sessionChunks)
      .where(eq(sessionChunks.messageId, TEST_MESSAGE_ID));
    const b = await db.select().from(sessionChunks)
      .where(eq(sessionChunks.messageId, TEST_OTHER_MESSAGE_ID));
    assert.equal(a.length, 0);
    assert.equal(b.length, 1, "another message's chunks are untouched");
  });
});

describe('chunkIndex.searchSessionChunks', () => {
  test('ranks the matching chunk first', async (t) => {
    if (!dbAvailable) return t.skip();
    /* Fresh state for this case. */
    await indexMessageChunks(TEST_MESSAGE_ID, TEST_SESSION_ID,
      'The Eiffel Tower is a wrought-iron lattice tower in Paris, France.\n\n' +
      'Photosynthesis converts light energy into chemical energy in plants.\n\n' +
      'The Great Wall of China runs along the northern border of ancient China.');
    const hits = await searchSessionChunks(
      TEST_SESSION_ID, 'Where is the Eiffel Tower located?', { limit: 3 },
    );
    assert.ok(hits.length >= 1, 'at least one hit');
    assert.ok(hits[0].text.toLowerCase().includes('eiffel tower'),
      'first hit mentions the Eiffel Tower');
    assert.ok(hits[0].score > 0, 'first hit has a positive score');
  });

  test('returns no hits for a session with no chunks', async (t) => {
    if (!dbAvailable) return t.skip();
    /* session_owned_by passes for the other user's session but
       we should still get no hits because the other user's
       session has no chunks indexed. */
    const hits = await searchSessionChunks(TEST_OTHER_SESSION_ID, 'eiffel', { limit: 3 });
    assert.deepEqual(hits, []);
  });

  test('does not cross sessions — a query in session A cannot hit session B', async (t) => {
    if (!dbAvailable) return t.skip();
    /* session A has a chunk with 'eiffel' from the previous test.
       session B has a chunk about eiffel that must not appear in
       A's search. */
    await indexMessageChunks(TEST_OTHER_MESSAGE_ID, TEST_OTHER_SESSION_ID,
      'Unrelated content for the other session. No eiffel here.');
    const hitsA = await searchSessionChunks(TEST_SESSION_ID, 'eiffel', { limit: 10 });
    assert.ok(hitsA.every((h) => h.messageId === TEST_MESSAGE_ID),
      'every hit in session A came from session A');
  });
});
