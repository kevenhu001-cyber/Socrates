import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { initDb, closeDb } from '../src/db/index.js';
import { users, sessions, apiKeys } from '../src/db/schema/index.js';
import { encrypt, encryptionKey } from '../src/lib/crypto.js';
import { prepareChatRequest } from '../src/routes/chat/helpers.js';
import { invalidateApiKeyCache } from '../src/services/core/apiKey.js';

/**
 * P_model-capability-registry — the conversation budget used to be one
 * global constant (100 000 tokens) for every model. That compressed a
 * 1M-token model's history far too early, while a model with a smaller
 * window was allowed past the point where the provider rejects the request.
 *
 * The budget now follows the window of the model that will actually serve
 * the turn. This test pins that wiring: the same oversized conversation is
 * left alone for a large-window model and summarised for a model with no
 * declared window.
 */

const enabled = Boolean(process.env.DATABASE_URL);
let db, owner, provider, fetchBefore;

before(async () => {
  if (!enabled) return;
  fetchBefore = globalThis.fetch;
  db = initDb(process.env.DATABASE_URL);
  [owner] = await db.insert(users).values([
    { email: `budget-${randomUUID()}@test.invalid`, passwordHash: 'test-only', displayName: 'Budget user' },
  ]).returning();
  [provider] = await db.insert(apiKeys).values({
    userId: owner.id,
    label: 'test-only',
    url: 'https://provider.test.invalid/v1',
    model: 'MiniMax-M3',
    keyCiphertext: encrypt('not-a-real-key', encryptionKey()),
    isActive: true,
  }).returning();
});

after(async () => {
  if (!enabled) return;
  globalThis.fetch = fetchBefore;
  for (const u of [owner]) if (u) await db.delete(users).where(eq(users.id, u.id));
  await closeDb();
});

/* 30 turns of 20 000 characters ≈ 150 000 estimated tokens: above the old
 * global budget, below the window of a large-window model. */
function oversizedConversation() {
  const filler = 'x'.repeat(20_000);
  return Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `turn ${i} ${filler}` }));
}

async function prepareWithModel(model, messages) {
  await db.update(apiKeys).set({ model }).where(eq(apiKeys.id, provider.id));
  /* The provider resolution is cached per user; the model change has to be
     visible to the next request. */
  invalidateApiKeyCache(owner.id);
  const s = (await db.insert(sessions).values({ userId: owner.id, title: 'budget test' }).returning())[0];
  const req = { query: {}, userId: owner.id, user: owner, body: { sessionId: s.id, mode: 'chat', messages } };
  const res = { status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
  const result = await prepareChatRequest(req, res);
  await db.delete(sessions).where(eq(sessions.id, s.id));
  return result;
}

test('a large-window model is not compressed at the old global budget', { skip: !enabled }, async () => {
  let upstreamCalls = 0;
  globalThis.fetch = async () => { upstreamCalls++; return new Response(JSON.stringify({ choices: [{ message: { content: 'summary' } }] })); };
  const messages = oversizedConversation();
  const result = await prepareWithModel('MiniMax-M3', messages);
  assert.equal(result.ok, true);
  /* No summariser call: the model's own window covers this conversation. */
  assert.equal(upstreamCalls, 0);
  assert.equal(result.payload.messages.length, messages.length + 1);
  assert.doesNotMatch(String(result.payload.messages.at(-1)?.content ?? ''), /Context summary/);
});

test('a model without a declared window still gets the old budget', { skip: !enabled }, async () => {
  let upstreamCalls = 0;
  globalThis.fetch = async () => { upstreamCalls++; return new Response(JSON.stringify({ choices: [{ message: { content: 'summary' } }] })); };
  const messages = oversizedConversation();
  const result = await prepareWithModel('test-model', messages);
  assert.equal(result.ok, true);
  /* The conversation is over the fallback budget, so the history is
     summarised — the pre-existing behaviour for models without a window.
     No built-in summariser provider exists in this fixture, so the
     compressor falls back to its tail-only marker instead of an LLM call. */
  assert.equal(upstreamCalls, 0);
  assert.ok(result.payload.messages.length < messages.length + 1);
  assert.match(
    result.payload.messages.map((m) => String(m.content ?? '')).join('\n'),
    /\[Context summary/,
  );
});
