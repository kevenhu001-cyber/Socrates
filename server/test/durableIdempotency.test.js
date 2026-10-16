import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { eq, and, sql } from 'drizzle-orm';
import { initDb, closeDb } from '../src/db/index.js';
import { users, authSessions, projects, sessions, idempotencyReceipts, agentApiKeys } from '../src/db/schema.js';
import { createAgentKey } from '../src/services/core/agentKeys.js';
import { runDurableJsonWrite } from '../src/services/core/durableIdempotency.js';
import { idempotencyMiddleware } from '../src/middleware/idempotency.js';
import { invalidateAuthCache } from '../src/lib/authCache.js';
import { runExpiredCleanup } from '../src/services/util/cleanupDb.js';
import { shutdownPubsub } from '../src/lib/pubsub.js';
import projectRouter from '../src/routes/projects.js';
import promptRouter from '../src/routes/prompts.js';
import taskRouter from '../src/routes/scheduledTasks.js';
import tagRouter from '../src/routes/tags.js';
import { listen, httpRequest } from './_http.js';

const enabled = Boolean(process.env.DATABASE_URL);
let db, userId, otherUserId, token, otherToken, sessionId, http;
const children = new Set();
const scope = (key, body = { name: 'test' }, patch = {}) => ({ userId, credentialHash: 'test-credential-digest', operation: 'test.create.v1', key, body, ...patch });
const insertProject = (name = 'atomic test') => async (tx) => {
  const [row] = await tx.insert(projects).values({ userId, name }).returning();
  return { status: 201, body: row };
};
before(async () => {
  if (!enabled) return;
  db = initDb(process.env.DATABASE_URL);
  const result = await db.insert(users).values([1, 2].map(() => ({ email: `receipt-${crypto.randomUUID()}@test.invalid`, passwordHash: 'test-only', verifiedAt: new Date() }))).returning();
  [userId, otherUserId] = result.map((u) => u.id);
  [token, otherToken] = [1, 2].map(() => crypto.randomBytes(32).toString('hex'));
  await db.insert(authSessions).values([{ userId, token }, { userId: otherUserId, token: otherToken }].map((row) => ({ ...row, expiresAt: new Date(Date.now() + 3600000) })));
  const [session] = await db.insert(sessions).values({ userId, title: 'tags test' }).returning();
  sessionId = session.id;
  const app = express();
  app.use(express.json({ limit: '1mb' }), cookieParser());
  app.use('/api', idempotencyMiddleware);
  app.use('/api/projects', projectRouter);
  app.use('/api/prompts', promptRouter);
  app.use('/api/scheduled-tasks', taskRouter);
  app.use('/api', tagRouter);
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ code: err.code || 'INTERNAL', message: err.message }));
  http = await listen(app);
});
after(async () => {
  for (const child of children) child.kill('SIGKILL');
  if (!enabled) return;
  await http?.close();
  if (userId) await db.delete(users).where(eq(users.id, userId));
  if (otherUserId) await db.delete(users).where(eq(users.id, otherUserId));
  invalidateAuthCache();
  await shutdownPubsub();
  await closeDb();
});

function child(code) {
  const url = (file) => JSON.stringify(pathToFileURL(path.resolve(file)).href);
  const script = `import { initDb, closeDb } from ${url('src/db/index.ts')};
import { projects } from ${url('src/db/schema.ts')};
import { runDurableJsonWrite } from ${url('src/services/core/durableIdempotency.ts')};
initDb(process.env.DATABASE_URL);
try { ${code} } finally { await closeDb(); }`;
  const proc = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { env: process.env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  children.add(proc);
  let output = '', error = '';
  proc.stdout.on('data', (chunk) => { output += chunk; });
  proc.stderr.on('data', (chunk) => { error += chunk; });
  const done = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code, signal) => {
      children.delete(proc);
      if (code === 0 || signal === 'SIGKILL') resolve(output);
      else reject(new Error(error || `child exit ${code}`));
    });
  });
  return { proc, done };
}
const request = (pathname, key, body, credential = token, method = 'POST') => httpRequest(http.url + '/api' + pathname, {
  method, cookies: credential ? { sid: credential } : {}, headers: key === undefined ? {} : { 'Idempotency-Key': key }, body,
});

test('independent processes commit one mutation and replay identical JSON', { skip: !enabled, timeout: 15000 }, async () => {
  const key = crypto.randomUUID();
  const code = `try { const r = await runDurableJsonWrite(${JSON.stringify(scope(key))}, async tx => {
 const [p] = await tx.insert(projects).values({userId:${JSON.stringify(userId)},name:${JSON.stringify(key)}}).returning();
 return {status:201,body:p}; }); console.log(JSON.stringify(r)); } catch(e) { console.log(JSON.stringify({code:e.code})); }`;
  const results = (await Promise.all([child(code).done, child(code).done, child(code).done])).map((r) => JSON.parse(r.trim()));
  assert.equal(results.filter((r) => r.replayed === false).length, 1);
  const committed = results.find((r) => r.serialized);
  for (const result of results) {
    if (result.serialized) assert.equal(result.serialized, committed.serialized);
    else assert.equal(result.code, 'IDEMPOTENCY_IN_PROGRESS');
  }
  const rows = await db.select().from(projects).where(and(eq(projects.userId, userId), eq(projects.name, key)));
  assert.equal(rows.length, 1);
  const restarted = JSON.parse((await child(code).done).trim());
  assert.equal(restarted.replayed, true);
  assert.equal(restarted.serialized, committed.serialized);
});

test('process killed before commit rolls back mutation and releases its claim', { skip: !enabled, timeout: 15000 }, async () => {
  const key = crypto.randomUUID();
  const worker = child(`await runDurableJsonWrite(${JSON.stringify(scope(key))}, async tx => {
 await tx.insert(projects).values({ userId:${JSON.stringify(userId)},name:${JSON.stringify(key)} });
 process.send('inserted'); await new Promise(resolve => process.on('message', resolve));
 return { status:201, body:{} }; });`);
  const [ready] = await once(worker.proc, 'message');
  assert.equal(ready, 'inserted');
  await assert.rejects(runDurableJsonWrite(scope(key), insertProject()), { code: 'IDEMPOTENCY_IN_PROGRESS' });
  worker.proc.kill('SIGKILL');
  await worker.done;
  assert.equal((await db.select().from(projects).where(eq(projects.name, key))).length, 0);
  let result;
  for (let i = 0; i < 30; i++) {
    try { result = await runDurableJsonWrite(scope(key), insertProject(key)); break; }
    catch (err) { if (err.code !== 'IDEMPOTENCY_IN_PROGRESS') throw err; await new Promise((r) => setTimeout(r, 20)); }
  }
  assert.equal(result?.replayed, false);
  assert.equal((await db.select().from(projects).where(eq(projects.name, key))).length, 1);
});

test('exceptions roll back writes and allow a safe retry', { skip: !enabled }, async () => {
  const key = crypto.randomUUID();
  await assert.rejects(runDurableJsonWrite(scope(key), async (tx) => {
    await tx.insert(projects).values({ userId, name: key });
    throw new Error('abort before receipt');
  }), /abort before receipt/);
  assert.equal((await db.select().from(projects).where(eq(projects.name, key))).length, 0);
  assert.equal((await runDurableJsonWrite(scope(key), insertProject(key))).replayed, false);
});

test('canonical body fingerprint ignores object key order but rejects changed arrays', { skip: !enabled }, async () => {
  const key = crypto.randomUUID();
  await runDurableJsonWrite(scope(key, { a: 1, b: { c: ['a', 'b'] } }), insertProject());
  const replay = await runDurableJsonWrite(scope(key, { b: { c: ['a', 'b'] }, a: 1 }), async () => { throw new Error('must not run'); });
  assert.equal(replay.replayed, true);
  await assert.rejects(runDurableJsonWrite(scope(key, { a: 1, b: { c: ['b', 'a'] } }), insertProject()), { code: 'IDEMPOTENCY_CONFLICT' });
});

test('large responses retain a completion marker instead of executing again', { skip: !enabled }, async () => {
  const key = crypto.randomUUID();
  await runDurableJsonWrite(scope(key), async () => ({ status: 201, body: 'x'.repeat(256 * 1024) }));
  await assert.rejects(runDurableJsonWrite(scope(key), async () => { throw new Error('must not run'); }), { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE' });
});

test('expired receipts may be replaced, credential and user scopes remain separate', { skip: !enabled }, async () => {
  const key = crypto.randomUUID();
  await runDurableJsonWrite(scope(key), insertProject());
  assert.equal((await runDurableJsonWrite(scope(key, undefined, { credentialHash: 'different' }), insertProject())).replayed, false);
  assert.equal((await runDurableJsonWrite(scope(key, undefined, { userId: otherUserId }), async () => ({ status: 200, body: {} }))).replayed, false);
  await db.update(idempotencyReceipts).set({ expiresAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(idempotencyReceipts.userId, userId));
  assert.equal((await runDurableJsonWrite(scope(key, { new: true }), insertProject())).replayed, false);
});

test('real create and tag handlers replay after auth, with body conflicts and aliases', { skip: !enabled }, async () => {
  for (const [route, body, method] of [
    ['/projects', { name: 'HTTP project' }, 'POST'],
    ['/prompts', { title: 'HTTP prompt', body: 'hello' }, 'POST'],
    ['/scheduled-tasks', { title: 'HTTP task', frequency: 'once' }, 'POST'],
    [`/sessions/${sessionId}/tags`, { tags: ['receipt-tag'] }, 'PUT'],
  ]) {
    const key = crypto.randomUUID();
    const first = await request(route, key, body, token, method);
    assert.equal(first.status, method === 'PUT' ? 200 : 201, first.text);
    const second = await request(route.toUpperCase() + '/', key, body, token, method);
    assert.equal(second.status, first.status, second.text);
    assert.equal(second.text, first.text);
    assert.equal(second.headers.get('idempotency-replayed'), 'true');
    const conflict = await request(route, key, { ...body, extra: true }, token, method);
    assert.equal(conflict.body.code, 'IDEMPOTENCY_CONFLICT');
    assert.equal((await request(route, key, body, null, method)).status, 401);
  }
});

test('selected routes reject invalid keys, still work without keys, and isolate callers', { skip: !enabled }, async () => {
  const bad = await request('/projects', 'invalid key', { name: 'invalid key' });
  assert.equal(bad.status, 400);
  assert.equal((await request('/projects', undefined, { name: 'no key' })).status, 201);
  const key = crypto.randomUUID();
  const first = await request('/projects', key, { name: 'owner scope' });
  const other = await request('/projects', key, { name: 'owner scope' }, otherToken);
  assert.equal(other.status, 201);
  assert.notEqual(other.body.id, first.body.id);
  assert.equal(other.body.userId, otherUserId);
});

test('a revoked credential cannot replay a previously committed write', { skip: !enabled }, async () => {
  const temporary = crypto.randomBytes(32).toString('hex');
  await db.insert(authSessions).values({ userId, token: temporary, expiresAt: new Date(Date.now() + 60000) });
  const key = crypto.randomUUID();
  assert.equal((await request('/projects', key, { name: 'revoked auth' }, temporary)).status, 201);
  await db.delete(authSessions).where(eq(authSessions.token, temporary));
  invalidateAuthCache(temporary);
  assert.equal((await request('/projects', key, { name: 'revoked auth' }, temporary)).status, 401);
});


test('scope reduction blocks replay even when a receipt exists', { skip: !enabled }, async () => {
  const issued = await createAgentKey({ ownerUserId: userId, label: 'receipt test', scopes: ['projects:write'] });
  const key = crypto.randomUUID();
  const options = { method: 'POST', headers: { Authorization: 'Bearer ' + issued.credential, 'Idempotency-Key': key }, body: { name: 'scoped write' } };
  assert.equal((await httpRequest(http.url + '/api/projects', options)).status, 201);
  await db.update(agentApiKeys).set({ scopes: ['projects:read'] }).where(eq(agentApiKeys.id, issued.id));
  const denied = await httpRequest(http.url + '/api/projects', options);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'INSUFFICIENT_SCOPE');
});

test('a credential past its expiry cannot replay a committed write', { skip: !enabled }, async () => {
  const issued = await createAgentKey({ ownerUserId: userId, label: 'expiry test', scopes: ['projects:write'] });
  const options = { method: 'POST', headers: { Authorization: 'Bearer ' + issued.credential, 'Idempotency-Key': crypto.randomUUID() }, body: { name: 'expiring write' } };
  assert.equal((await httpRequest(http.url + '/api/projects', options)).status, 201);
  await db.update(agentApiKeys).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(agentApiKeys.id, issued.id));
  assert.equal((await httpRequest(http.url + '/api/projects', options)).status, 401);
});

test('process killed after commit but before delivery leaves a replayable result', { skip: !enabled, timeout: 15000 }, async () => {
  const key = crypto.randomUUID();
  const worker = child(`const result = await runDurableJsonWrite(${JSON.stringify(scope(key))}, async tx => {
 const [row] = await tx.insert(projects).values({userId:${JSON.stringify(userId)},name:${JSON.stringify(key)}}).returning();
 return {status:201,body:row}; });
 process.send(result); await new Promise(resolve => process.on('message', resolve));`);
  const [committed] = await once(worker.proc, 'message');
  worker.proc.kill('SIGKILL');
  await worker.done;
  const restarted = child(`const result = await runDurableJsonWrite(${JSON.stringify(scope(key))}, async () => {throw new Error('must not repeat');}); console.log(JSON.stringify(result));`);
  const replay = JSON.parse((await restarted.done).trim());
  assert.equal(replay.replayed, true);
  assert.equal(replay.serialized, committed.serialized);
  assert.equal((await db.select().from(projects).where(eq(projects.name, key))).length, 1);
});


test('periodic cleanup removes expired receipts while retaining live results', { skip: !enabled }, async () => {
  const expiredOperation = 'test.cleanup.expired.v1';
  const liveOperation = 'test.cleanup.live.v1';
  await runDurableJsonWrite(scope(crypto.randomUUID(), {}, { operation: expiredOperation }), insertProject());
  await runDurableJsonWrite(scope(crypto.randomUUID(), {}, { operation: liveOperation }), insertProject());
  await db.update(idempotencyReceipts).set({ expiresAt: sql`clock_timestamp() - interval '1 second'` })
    .where(eq(idempotencyReceipts.operation, expiredOperation));
  await runExpiredCleanup();
  assert.equal((await db.select().from(idempotencyReceipts).where(eq(idempotencyReceipts.operation, expiredOperation))).length, 0);
  assert.equal((await db.select().from(idempotencyReceipts).where(eq(idempotencyReceipts.operation, liveOperation))).length, 1);
});
