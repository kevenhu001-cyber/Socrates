import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { appRouteFixture } from './_appRouteFixture.js';
import { listen } from './_http.js';
import { apiKeys, sessions } from '../src/db/schema/index.js';
import { encrypt, encryptionKey } from '../src/lib/crypto.js';
import { invalidateApiKeyCache } from '../src/services/core/apiKey.js';
import { getLlmDispatcher } from '../src/services/core/llm.js';

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

test('shared chat first, then proxy, does not re-inject Beagle identity into the existing snapshot', async () => {
  const s = await newSession(), start = requests.length;
  for (const path of ['/api/v2/chat', '/api/v2/minimax/v1/chat/completions']) {
    const response = await f.request(path, { method: 'POST', body: body(s.id, 'chat-first settings') });
    assert.equal(response.status, 200, response.text);
  }
  assert.equal(requests[start].messages[0].content, requests[start + 1].messages[0].content);
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
