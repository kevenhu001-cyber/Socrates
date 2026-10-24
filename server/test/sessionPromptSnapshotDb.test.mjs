import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { initDb, closeDb } from '../src/db/index.js';
import { users, sessions, apiKeys, memories, sessionPromptSnapshots } from '../src/db/schema/index.js';
import { encrypt, encryptionKey } from '../src/lib/crypto.js';
import { prepareChatRequest } from '../src/routes/chat/helpers.js';
import { resolveSessionPrompt } from '../src/services/core/sessionPromptSnapshot.js';

const enabled = Boolean(process.env.DATABASE_URL);
let db, owner, other;
before(async () => {
  if (!enabled) return;
  db = initDb(process.env.DATABASE_URL);
  [owner, other] = await db.insert(users).values([
    { email: `prompt-${randomUUID()}@test.invalid`, passwordHash: 'test-only', displayName: 'Original name' },
    { email: `prompt-${randomUUID()}@test.invalid`, passwordHash: 'test-only' },
  ]).returning();
  await db.insert(apiKeys).values({ userId: owner.id, label: 'test-only', url: 'https://provider.test.invalid/v1', model: 'test-model', keyCiphertext: encrypt('not-a-real-key', encryptionKey()), isActive: true });
});
after(async () => {
  if (!enabled) return;
  for (const user of [owner, other]) if (user) await db.delete(users).where(eq(users.id, user.id));
  await closeDb();
});
async function session() { return (await db.insert(sessions).values({ userId: owner.id, title: 'snapshot test' }).returning())[0]; }
async function prepare(s, custom, user = owner, extra = {}) {
  const req = { query: {}, userId: user.id, user, body: { sessionId: s.id, mode: 'chat', messages: [{ role: 'system', content: `[User custom instructions]\n${custom}` }, { role: 'user', content: 'latest user question' }], ...extra } };
  const res = { status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
  return prepareChatRequest(req, res);
}

test('real prelude freezes user/custom/memory context and refreshes it only for a new session', { skip: !enabled }, async () => {
  const s = await session();
  const [memory] = await db.insert(memories).values({ userId: owner.id, text: 'original durable fact', scope: 'global', enabled: true }).returning();
  const first = await prepare(s, 'original custom instructions');
  assert.equal(first.ok, true);
  const frozen = first.payload.messages[0].content;
  assert.match(frozen, /original durable fact/);
  assert.match(frozen, /Original name/);
  await db.update(memories).set({ text: 'new durable fact' }).where(eq(memories.id, memory.id));
  const changedOwner = { ...owner, displayName: 'Changed name' };
  const second = await prepare(s, 'changed custom instructions', changedOwner);
  assert.equal(second.payload.messages[0].content, frozen);
  assert.equal(second.payload.messages.filter((m) => m.role === 'system').length, 1);
  assert.equal(second.payload.messages.at(-1).content, 'latest user question');
  const fresh = await prepare(await session(), 'changed custom instructions', changedOwner);
  assert.match(fresh.payload.messages[0].content, /Changed name/);
  assert.match(fresh.payload.messages[0].content, /new durable fact/);
  assert.match(fresh.payload.messages[0].content, /changed custom instructions/);
  assert.equal((await db.select().from(sessionPromptSnapshots).where(eq(sessionPromptSnapshots.sessionId, s.id))).length, 1);
});

test('new server process reuses the persisted bytes without invoking initialization', { skip: !enabled }, async () => {
  const s = await session();
  const prompt = await resolveSessionPrompt(owner.id, s.id, async () => 'persistent secret system prefix');
  const script = `import {createHash} from 'node:crypto';import {initDb,closeDb} from './src/db/index.ts';import {resolveSessionPrompt} from './src/services/core/sessionPromptSnapshot.ts';initDb(process.env.DATABASE_URL);try { const p=await resolveSessionPrompt(${JSON.stringify(owner.id)},${JSON.stringify(s.id)},async()=>{throw new Error('unexpected reinjection')}); console.log(createHash('sha256').update(p).digest('hex'));}finally {await closeDb();}`;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 15000 });
  assert.equal(child.status, 0, child.stderr);
  assert.ok(child.stdout.includes(createHash('sha256').update(prompt).digest('hex')));
});

test('foreign sessions are denied for both cached and uninitialized prompts; deleting session cascades snapshot', { skip: !enabled }, async () => {
  for (const cached of [true, false]) {
    const s = await session();
    if (cached) await resolveSessionPrompt(owner.id, s.id, async () => 'private');
    await assert.rejects(() => prepare(s, 'attacker instructions', other), { status: 404 });
    await db.delete(sessions).where(eq(sessions.id, s.id));
    assert.equal((await db.select().from(sessionPromptSnapshots).where(eq(sessionPromptSnapshots.sessionId, s.id))).length, 0);
  }
});

test('changing teaching stages updates turn instructions without regenerating the tutor system prefix', { skip: !enabled }, async () => {
  const s = await session();
  const lesson = (stage) => ({ mode: 'tutor', messages: [
    { role: 'system', content: `[Assistant mode instructions]\nStable tutor persona\nThe current lesson context follows.\nCurrent teaching stage: ${stage}` },
    { role: 'user', content: 'continue the lesson' },
  ] });
  const first = await prepare(s, '', owner, lesson('exercise'));
  const second = await prepare(s, '', owner, lesson('check'));
  assert.equal(first.payload.messages[0].content, second.payload.messages[0].content);
  assert.doesNotMatch(first.payload.messages[0].content, /Current teaching stage:/);
  assert.match(first.payload.messages.at(-1).content, /Current teaching stage: exercise/);
  assert.match(second.payload.messages.at(-1).content, /Current teaching stage: check/);
  assert.doesNotMatch(second.payload.messages.at(-1).content, /Current teaching stage: exercise/);
});

test('query-only session scope shares the same snapshot and conflicting body scope is rejected', { skip: !enabled }, async () => {
  const s = await session();
  const frozen = await resolveSessionPrompt(owner.id, s.id, async () => 'query session prompt');
  const req = { userId: owner.id, user: owner, query: { sessionId: s.id }, body: { messages: [{ role: 'user', content: 'continue' }] } };
  const res = { status() { return this; }, json() { return this; } };
  /* The outbound system prompt is the frozen snapshot plus the server-owned
     typography rule (P_response-typography), so it is deliberately not
     byte-identical to the stored snapshot. What this test owns is that the
     query scope and the body scope resolve the SAME snapshot — not that the
     outbound prompt equals the stored bytes. */
  const viaQuery = (await prepareChatRequest(req, res)).payload.messages[0].content;
  assert.ok(viaQuery.startsWith(frozen), viaQuery);
  assert.match(viaQuery, /\[Server policy: response-typography\]/);
  req.body.sessionId = s.id;
  assert.equal((await prepareChatRequest(req, res)).payload.messages[0].content, viaQuery);
  req.body.sessionId = randomUUID();
  await assert.rejects(() => prepareChatRequest(req, res), { status: 400 });
});
