import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { appRouteFixture } from './_appRouteFixture.js';
import { listen } from './_http.js';
import { apiKeys, sessions, sessionPromptSnapshots } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { encrypt, encryptionKey } from '../src/lib/crypto.js';
import { invalidateApiKeyCache } from '../src/services/core/apiKey.js';
import { getLlmDispatcher } from '../src/services/core/llm.js';
import { BEAGLE_IDENTITY_MARKER } from '../src/lib/chatPolicy.js';

const f = appRouteFixture();
let upstream;
const requests = [];
async function ensureProvider() {
  if (upstream) return;
  const provider = express();
  provider.use(express.json({ limit: '2mb' }));
  provider.post('/v1/chat/completions', (req, res) => {
    requests.push(req.body);
    res.json({ choices: [{ message: { content: 'test reply' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  });
  upstream = await listen(provider);
  await f.db.insert(apiKeys).values({ userId: f.owner.id, label: 'snapshot-test-built-in', url: upstream.url + '/v1', model: 'test-model', keyCiphertext: encrypt('not-a-real-key', encryptionKey()), isActive: true, isBuiltIn: true });
  invalidateApiKeyCache();
}
after(async () => { invalidateApiKeyCache(); await getLlmDispatcher().close(); await upstream?.close(); });
const body = (sessionId, text) => ({ sessionId, messages: [{ role: 'system', content: `[User custom instructions]\n${text}` }, { role: 'user', content: 'hello' }] });
async function newSession() {
  await ensureProvider();
  return (await f.db.insert(sessions).values({ userId: f.owner.id, title: 'proxy prompt test' }).returning())[0];
}

/** A BYOK key for another user, pointed at the same mock upstream. */
async function ensureByokProvider(userId) {
  await ensureProvider();
  const [existing] = await f.db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
  if (existing) return;
  await f.db.insert(apiKeys).values({ userId, label: 'snapshot-test-byok', url: upstream.url + '/v1', model: 'test-model', keyCiphertext: encrypt('not-a-real-key', encryptionKey()), isActive: true, isBuiltIn: false });
  invalidateApiKeyCache();
}

test('built-in proxy and shared chat send byte-identical session prompts to a local mock provider', async () => {
  const s = await newSession();
  const start = requests.length;
  for (const [path, custom] of [
    ['/api/v2/minimax/v1/chat/completions', 'first settings'],
    ['/api/v2/chat', 'changed settings'],
    ['/api/v2/minimax/v1/chat/completions', 'third settings'],
  ]) {
    const response = await f.request(path, { method: 'POST', body: body(s.id, custom) });
    assert.equal(response.status, 200, response.text);
  }
  const prompts = requests.slice(start).map((r) => r.messages[0].content);
  assert.equal(prompts.length, 3);
  assert.equal(prompts[0], prompts[1]);
  assert.equal(prompts[1], prompts[2]);
  assert.match(prompts[0], /first settings/);
  assert.doesNotMatch(prompts[0], /changed settings|third settings/);
});

test('the shared snapshot stays provider-independent; the built-in identity is resolved per request', async () => {
  const s = await newSession(), start = requests.length;
  for (const path of ['/api/v2/chat', '/api/v2/minimax/v1/chat/completions']) {
    const response = await f.request(path, { method: 'POST', body: body(s.id, 'chat-first settings') });
    assert.equal(response.status, 200, response.text);
  }
  assert.equal(requests[start].messages[0].content, requests[start + 1].messages[0].content);

  /* P_provider-identity-not-session-state — the built-in provider identity is
     sent upstream on every built-in turn, but it must never be persisted into
     the shared session snapshot. Otherwise the next turn of this session, when
     it is served by the user's own BYOK provider, would forward "You are
     Beagle" to their own upstream. */
  const [stored] = await f.db.select().from(sessionPromptSnapshots)
    .where(eq(sessionPromptSnapshots.sessionId, s.id));
  assert.ok(stored, 'the session prompt snapshot should exist');
  assert.equal(stored.systemPrompt.includes(BEAGLE_IDENTITY_MARKER), false,
    'the stored snapshot must not contain the built-in provider identity');
  assert.match(requests[start].messages[0].content, new RegExp(BEAGLE_IDENTITY_MARKER),
    'the built-in turn should still carry the provider identity upstream');
});

test('a built-in turn first never leaks the provider identity into a later BYOK turn', async () => {
  /* P_provider-identity-not-session-state — the decisive regression: the
     built-in proxy initializes the shared snapshot, and the SAME session is
     then served by the user's own (BYOK) provider. If the built-in identity
     were frozen into the snapshot, the user's own upstream would receive
     "You are Beagle" on every later turn of that session. */
  await ensureByokProvider(f.other.id);
  const session = (await f.db.insert(sessions).values({ userId: f.other.id, title: 'byok leak probe' }).returning())[0];
  const start = requests.length;

  // Turn 1: the built-in proxy initializes the snapshot for this session.
  const builtIn = await f.request('/api/v2/minimax/v1/chat/completions', { method: 'POST', as: f.other, body: body(session.id, 'first settings') });
  assert.equal(builtIn.status, 200, builtIn.text);
  assert.match(requests[start].messages[0].content, new RegExp(BEAGLE_IDENTITY_MARKER),
    'the built-in turn should carry the provider identity upstream');

  // Turn 2: the same session, now served by the user's own provider.
  const byok = await f.request('/api/v2/chat', { method: 'POST', as: f.other, body: body(session.id, 'second settings') });
  assert.equal(byok.status, 200, byok.text);
  assert.equal(requests[start + 1].messages[0].content.includes(BEAGLE_IDENTITY_MARKER), false,
    'the built-in provider identity must never reach a user-configured provider');
  assert.match(requests[start + 1].messages[0].content, /first settings/,
    'the session prefix must still be shared across transports');

  // And the persisted snapshot must be free of the built-in identity.
  const [stored] = await f.db.select().from(sessionPromptSnapshots)
    .where(eq(sessionPromptSnapshots.sessionId, session.id));
  assert.ok(stored, 'the session prompt snapshot should exist');
  assert.equal(stored.systemPrompt.includes(BEAGLE_IDENTITY_MARKER), false,
    'the stored snapshot must not contain the built-in provider identity');
});

test('proxy rejects foreign sessions and conflicting query/body scope without calling the provider', async () => {
  const s = await newSession(), count = requests.length;
  const foreign = await f.request('/api/v2/minimax/v1/chat/completions', { method: 'POST', as: f.other, body: body(s.id, 'attack') });
  assert.equal(foreign.status, 404);
  const another = await newSession();
  const conflict = await f.request(`/api/v2/minimax/v1/chat/completions?sessionId=${another.id}`, { method: 'POST', body: body(s.id, 'conflict') });
  assert.equal(conflict.status, 400);
  assert.equal(requests.length, count);
});
