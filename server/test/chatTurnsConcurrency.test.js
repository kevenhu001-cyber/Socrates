import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { initDb, closeDb } from '../src/db/index.js';
import { users, authSessions, chatTurnEvents, chatTurns, sessions, apiKeys } from '../src/db/schema/index.js';
import { createChatTurn, listChatTurnEvents, claimChatTurnExecution, touchChatTurnExecution, recoverStaleChatTurns, setChatTurnStatus, getChatTurn } from '../src/services/core/chatTurns.js';
import { registerStreamRoute } from '../src/routes/chat/stream.js';
import { encrypt, encryptionKey } from '../src/lib/crypto.js';
import { getLlmDispatcher } from '../src/services/core/llm.js';
import { shutdownPubsub } from '../src/lib/pubsub.js';
import router from '../src/routes/chatTurns.js';
import { errorHandler } from '../src/middleware/error.js';
import { listen } from './_http.js';

const enabled = Boolean(process.env.DATABASE_URL);
let db;
let userId;
let server;
const sid = crypto.randomBytes(32).toString('hex');
before(async () => {
  if (!enabled) return;
  db = initDb(process.env.DATABASE_URL);
  const [user] = await db.insert(users).values({ email: `turn-concurrency-${crypto.randomUUID()}@test.invalid`, passwordHash: 'test-only', verifiedAt: new Date() }).returning();
  userId = user.id;
  await db.insert(authSessions).values({ token: sid, userId, expiresAt: new Date(Date.now() + 60000) });
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/chat-turns', router);
  const streamRouter = express.Router();
  registerStreamRoute(streamRouter);
  app.use('/api/chat', streamRouter);
  app.use(errorHandler);
  server = await listen(app);
});
after(async () => {
  if (!enabled) return;
  await server?.close();
  if (userId) await db.delete(users).where(eq(users.id, userId));
  await shutdownPubsub();
  await closeDb();
  await getLlmDispatcher().close();
});

function inOtherProcess(code) {
  const dbModule = pathToFileURL(path.resolve('src/db/index.ts')).href;
  const turnModule = pathToFileURL(path.resolve('src/services/core/chatTurns.ts')).href;
  const script = `import { initDb, closeDb } from ${JSON.stringify(dbModule)};
import { createChatTurn, publishChatTurnEvent, claimChatTurnExecution } from ${JSON.stringify(turnModule)};
initDb(process.env.DATABASE_URL);
try { ${code} } finally { await closeDb(); }`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `worker exited ${code}`)));
  });
}

test('independent processes create one turn and allocate unique contiguous event sequences', { skip: !enabled, timeout: 15000 }, async () => {
  const create = `const r = await createChatTurn({ userId: ${JSON.stringify(userId)}, clientTurnId: 'same-concurrent-key' }); console.log(JSON.stringify({ id: r.turn.id, created: r.created }));`;
  const created = (await Promise.all([inOtherProcess(create), inOtherProcess(create), inOtherProcess(create)])).map((s) => JSON.parse(s));
  assert.equal(new Set(created.map((row) => row.id)).size, 1);
  assert.equal(created.filter((row) => row.created).length, 1);
  const turnId = created[0].id;
  const publish = `await Promise.all(Array.from({ length: 12 }, (_, i) => publishChatTurnEvent(${JSON.stringify(turnId)}, 'content', { delta: String(i), worker })));`;
  await Promise.all(['a', 'b', 'c'].map((worker) => inOtherProcess(`const worker = ${JSON.stringify(worker)}; ${publish}`)));
  const events = await listChatTurnEvents(userId, turnId);
  assert.deepEqual(events.map((event) => event.sequence), Array.from({ length: 37 }, (_, i) => i + 1));
  assert.equal(events[0].event, 'turn_created');
  assert.equal((await listChatTurnEvents(userId, turnId, 30, 3)).length, 3);
  for (const worker of ['a', 'b', 'c']) {
    assert.deepEqual(events.filter((event) => event.data.worker === worker).map((event) => event.data.delta), Array.from({ length: 12 }, (_, i) => String(i)), 'each worker preserves its own publication order');
  }
});

test('only one process can claim execution; terminal turns cannot be executed again', { skip: !enabled, timeout: 15000 }, async () => {
  const { turn } = await createChatTurn({ userId, clientTurnId: 'claim-once' });
  const claim = `try { await claimChatTurnExecution(${JSON.stringify(userId)}, ${JSON.stringify(turn.id)}); console.log('claimed'); } catch(e) { if (e.status !== 409) throw e; console.log('conflict'); }`;
  const results = await Promise.all([inOtherProcess(claim), inOtherProcess(claim), inOtherProcess(claim)]);
  assert.equal(results.filter((s) => s.trim() === 'claimed').length, 1);
  await setChatTurnStatus(turn.id, 'completed');
  await assert.rejects(() => claimChatTurnExecution(userId, turn.id), { status: 409 });
});

test('stale chat workers become interrupted; live workers and terminal status are protected', { skip: !enabled }, async () => {
  const stale = (await createChatTurn({ userId, clientTurnId: 'stale-execution' })).turn;
  const live = (await createChatTurn({ userId, clientTurnId: 'live-execution' })).turn;
  await claimChatTurnExecution(userId, stale.id);
  await claimChatTurnExecution(userId, live.id);
  await db.update(chatTurns).set({ updatedAt: new Date(Date.now() - 180000) }).where(eq(chatTurns.id, stale.id));
  assert.equal(await touchChatTurnExecution(userId, live.id), true);
  await recoverStaleChatTurns();
  assert.equal((await getChatTurn(userId, stale.id)).status, 'interrupted');
  assert.equal((await getChatTurn(userId, live.id)).status, 'running');
  await setChatTurnStatus(stale.id, 'completed');
  assert.equal((await getChatTurn(userId, stale.id)).status, 'interrupted');
  await assert.rejects(() => claimChatTurnExecution(userId, stale.id), { status: 409 });
  assert.equal(await touchChatTurnExecution(userId, stale.id), false);
});

test('a client turn ID cannot be rebound to a different session', { skip: !enabled }, async () => {
  const rows = await db.insert(sessions).values([
    { userId, topic: 'first', mode: 'chat', phase: 'chat', kind: 'chat' },
    { userId, topic: 'second', mode: 'chat', phase: 'chat', kind: 'chat' },
  ]).returning();
  await createChatTurn({ userId, sessionId: rows[0].id, clientTurnId: 'fixed-session' });
  await assert.rejects(() => createChatTurn({ userId, sessionId: rows[1].id, clientTurnId: 'fixed-session' }), { status: 409 });
});

test('concurrent HTTP streams bound to one turn make only one upstream LLM call', { skip: !enabled, timeout: 15000 }, async () => {
  let calls = 0;
  const provider = express();
  provider.use(express.json());
  provider.post('/v1/chat/completions', async (_req, res) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 100));
    res.set('Content-Type', 'text/event-stream');
    res.end('data: {"choices":[{"delta":{"content":"one response"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  const upstream = await listen(provider);
  try {
    await db.insert(apiKeys).values({ userId, label: 'test', url: upstream.url + '/v1', model: 'test-model', keyCiphertext: encrypt('test-only', encryptionKey()), isActive: true });
    const [session] = await db.insert(sessions).values({ userId, topic: 'claim test', mode: 'chat', phase: 'chat', kind: 'chat' }).returning();
    const request = () => fetch(`${server.url}/api/chat/stream?sessionId=${session.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `sid=${sid}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }], clientTurn: { id: 'http-claim-once' } }),
    }).then((r) => r.text());
    const responses = await Promise.all([request(), request(), request()]);
    assert.equal(calls, 1);
    assert.equal(responses.filter((s) => s.includes('This turn has already been claimed')).length, 2);
    assert.equal(responses.filter((s) => s.includes('"code":"CONFLICT"')).length, 2);
    assert.ok(responses.every((s) => s.includes('event: turn_bound')), 'both winners and retries receive the durable reconnect ID');
    assert.equal(responses.filter((s) => s.includes('one response')).length, 1);
  } finally { await upstream.close(); }
});

test('SSE replays more than one page and tails events committed by another process', { skip: !enabled, timeout: 15000 }, async () => {
  const { turn } = await createChatTurn({ userId, clientTurnId: 'cross-process-sse' });
  await db.insert(chatTurnEvents).values(Array.from({ length: 505 }, (_, i) => ({ turnId: turn.id, sequence: i + 2, event: 'content', payload: { delta: 'x' } })));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let reader;
  try {
    const response = await fetch(`${server.url}/api/chat-turns/${turn.id}/events`, { headers: { Cookie: `sid=${sid}` }, signal: controller.signal });
    assert.equal(response.status, 200);
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const seen = [];
    const readTo = async (count) => {
      while (seen.length < count) {
        const chunk = await reader.read();
        assert.equal(chunk.done, false, 'SSE ended before all durable events were delivered');
        buffer += decoder.decode(chunk.value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (frame.startsWith('event: turn_event\n')) seen.push(JSON.parse(frame.split('\ndata: ')[1]).sequence);
        }
      }
    };
    await readTo(506);
    await inOtherProcess(`await publishChatTurnEvent(${JSON.stringify(turn.id)}, 'content', { delta: 'remote' });`);
    await readTo(507);
    assert.deepEqual(seen, Array.from({ length: 507 }, (_, i) => i + 1));
  } finally {
    clearTimeout(timer);
    await reader?.cancel().catch(() => {});
    controller.abort();
  }
});
