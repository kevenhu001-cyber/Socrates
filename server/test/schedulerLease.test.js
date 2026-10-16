import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import express from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { initDb, closeDb } from '../src/db/index.js';
import { users, apiKeys, scheduledTasks, scheduledTaskLeases, messages } from '../src/db/schema.js';
import { claimScheduledTask, renewScheduledTaskLease, withScheduledTaskLease } from '../src/services/core/scheduledTaskLease.js';
import { runScheduledTaskNow, pollScheduledTasksOnce } from '../src/services/scheduler.js';
import { encrypt, encryptionKey } from '../src/lib/crypto.js';
import { getLlmDispatcher } from '../src/services/llm.js';
import { shutdownPubsub } from '../src/lib/pubsub.js';
import { listen } from './_http.js';

const enabled = Boolean(process.env.DATABASE_URL);
let db;
let userId;
let upstream;
let calls = 0;
let providerHook = null;
before(async () => {
  if (!enabled) return;
  db = initDb(process.env.DATABASE_URL);
  const [user] = await db.insert(users).values({ email: `scheduler-lease-${crypto.randomUUID()}@test.invalid`, passwordHash: 'test-only' }).returning();
  userId = user.id;
  const provider = express();
  provider.use(express.json());
  provider.post('/v1/chat/completions', async (_req, res) => {
    calls++;
    if (providerHook) await providerHook();
    res.json({ choices: [{ message: { content: 'scheduled result' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } });
  });
  upstream = await listen(provider);
  await db.insert(apiKeys).values({ userId, label: 'test', url: upstream.url + '/v1', model: 'test-model', keyCiphertext: encrypt('test-only', encryptionKey()), isActive: true });
});
after(async () => {
  if (!enabled) return;
  providerHook = null;
  await getLlmDispatcher().close();
  await upstream?.close();
  if (userId) await db.delete(users).where(eq(users.id, userId));
  await shutdownPubsub();
  await closeDb();
});

async function makeTask(patch = {}) {
  const [task] = await db.insert(scheduledTasks).values({ userId, title: 'lease test', prompt: 'hello', status: 'active', frequency: 'once', nextRunAt: new Date(Date.now() - 1000), ...patch }).returning();
  return task;
}
async function expire(taskId) {
  await db.update(scheduledTaskLeases).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(scheduledTaskLeases.taskId, taskId));
}
async function readTask(taskId) {
  return (await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, taskId)))[0];
}

function childScript(code) {
  const dbModule = pathToFileURL(path.resolve('src/db/index.ts')).href;
  const leaseModule = pathToFileURL(path.resolve('src/services/core/scheduledTaskLease.ts')).href;
  const script = `import { initDb, closeDb } from ${JSON.stringify(dbModule)}; import { claimScheduledTask } from ${JSON.stringify(leaseModule)};
initDb(process.env.DATABASE_URL); try { ${code} } finally { await closeDb(); }`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
  });
}

test('independent processes serialize a task claim without advancing its scheduled slot', { skip: !enabled, timeout: 10000 }, async () => {
  const task = await makeTask();
  const code = `const r = await claimScheduledTask(${JSON.stringify(task.id)}, ${JSON.stringify(userId)}, true); console.log(r ? 'claimed' : 'busy');`;
  const results = await Promise.all([childScript(code), childScript(code), childScript(code)]);
  assert.equal(results.filter((s) => s.trim() === 'claimed').length, 1);
  assert.equal((await readTask(task.id)).nextRunAt.getTime(), task.nextRunAt.getTime());
  await db.update(scheduledTasks).set({ status: 'paused' }).where(eq(scheduledTasks.id, task.id));
});

test('a process exit after claiming is recoverable, with a stable execution ID and a new owner', { skip: !enabled }, async () => {
  const task = await makeTask();
  const code = `const r = await claimScheduledTask(${JSON.stringify(task.id)}, ${JSON.stringify(userId)}, true); console.log(JSON.stringify(r.lease));`;
  const previous = JSON.parse(await childScript(code)); // The owner process exits here.
  await expire(task.id);
  const reclaimed = await claimScheduledTask(task.id, userId, true);
  assert.equal(reclaimed.lease.executionId, previous.executionId);
  assert.notEqual(reclaimed.lease.ownerToken, previous.ownerToken);
  assert.equal(reclaimed.lease.attempts, 2);
  assert.equal(await renewScheduledTaskLease(previous), false);
  await assert.rejects(() => withScheduledTaskLease(previous, async (tx) => {
    await tx.update(scheduledTasks).set({ title: 'stale overwrite' }).where(eq(scheduledTasks.id, task.id));
  }), { status: 409 });
  assert.equal((await readTask(task.id)).title, 'lease test');
  await db.update(scheduledTasks).set({ status: 'paused' }).where(eq(scheduledTasks.id, task.id));
});

test('expired workspace agents pause with uncertain outcomes instead of replaying side effects', { skip: !enabled }, async () => {
  const task = await makeTask({ agentKind: 'codex' });
  await claimScheduledTask(task.id, userId, true);
  // Editing the task must not erase the original execution's side-effect policy.
  await db.update(scheduledTasks).set({ agentKind: 'native' }).where(eq(scheduledTasks.id, task.id));
  await expire(task.id);
  await assert.rejects(() => claimScheduledTask(task.id, userId, true), { status: 409 });
  assert.equal((await readTask(task.id)).status, 'paused');
  const [lease] = await db.select().from(scheduledTaskLeases).where(eq(scheduledTaskLeases.taskId, task.id));
  assert.equal(lease.state, 'uncertain');
  assert.match(lease.error, /external effects/);
});

test('manual and scheduled runs cannot overlap; completion writes one result pair and increments once', { skip: !enabled }, async () => {
  const task = await makeTask();
  const beforeCalls = calls;
  let entered;
  let release;
  const started = new Promise((resolve) => { entered = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  providerHook = async () => { entered(); await gate; };
  const running = runScheduledTaskNow(task, { automatic: true });
  try {
    await started;
    await assert.rejects(() => runScheduledTaskNow(task), { status: 409 });
    const busy = await runScheduledTaskNow(task, { automatic: true });
    assert.equal(busy.runCount, 0);
  } finally { release(); providerHook = null; }
  const updated = await running;
  assert.equal(updated.status, 'completed');
  assert.equal(updated.nextRunAt, null);
  assert.equal(updated.runCount, 1);
  assert.equal(calls - beforeCalls, 1);
  const rows = await db.select().from(messages).where(eq(messages.sessionId, updated.sessionId));
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.clientId.startsWith('sched-')));
});

test('polling recovers an expired native one-shot without losing its due slot', { skip: !enabled }, async () => {
  const task = await makeTask();
  const first = await claimScheduledTask(task.id, userId, true);
  await expire(task.id);
  await pollScheduledTasksOnce();
  const result = await readTask(task.id);
  assert.equal(result.status, 'completed');
  assert.equal(result.runCount, 1);
  const [lease] = await db.select().from(scheduledTaskLeases).where(eq(scheduledTaskLeases.taskId, task.id));
  assert.equal(lease.executionId, first.lease.executionId);
  assert.equal(lease.attempts, 2);
  assert.equal(lease.state, 'completed');
  await pollScheduledTasksOnce();
  assert.equal((await readTask(task.id)).runCount, 1, 'a completed occurrence must not execute again');
});

test('a live owner renews its lease; scheduled completion advances once and manual runs preserve the next slot', { skip: !enabled }, async () => {
  const task = await makeTask({ frequency: 'hourly' });
  const first = await claimScheduledTask(task.id, userId, true);
  assert.equal(await renewScheduledTaskLease(first.lease), true);
  await expire(task.id);
  assert.equal(await renewScheduledTaskLease(first.lease), false, 'an expired owner cannot resurrect its lease');
  const scheduled = await runScheduledTaskNow(task, { automatic: true });
  assert.equal(scheduled.status, 'active');
  assert.ok(scheduled.nextRunAt.getTime() > Date.now());
  const manual = await runScheduledTaskNow(scheduled, { reschedule: false });
  assert.equal(manual.nextRunAt.getTime(), scheduled.nextRunAt.getTime());
  assert.equal(manual.runCount, 2);
  const rows = await db.select().from(messages).where(eq(messages.sessionId, manual.sessionId));
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map((row) => row.clientId)).size, 4);
  await db.update(scheduledTasks).set({ status: 'paused' }).where(eq(scheduledTasks.id, task.id));
});

test('completion preserves a pause/reschedule made while the provider is running', { skip: !enabled }, async () => {
  const task = await makeTask({ frequency: 'daily' });
  const future = new Date(Date.now() + 3 * 86400000);
  providerHook = async () => {
    await db.update(scheduledTasks).set({ status: 'paused', nextRunAt: future }).where(eq(scheduledTasks.id, task.id));
  };
  try {
    const result = await runScheduledTaskNow(task, { automatic: true });
    assert.equal(result.status, 'paused');
    assert.equal(result.nextRunAt.getTime(), future.getTime());
    assert.equal(result.runCount, 1);
  } finally { providerHook = null; }
});

test('a stale worker finishing after lease takeover cannot persist messages or counters', { skip: !enabled }, async () => {
  const task = await makeTask();
  providerHook = async () => {
    await expire(task.id);
    assert.ok(await claimScheduledTask(task.id, userId, true));
  };
  try {
    await assert.rejects(() => runScheduledTaskNow(task, { automatic: true }), { status: 409 });
    assert.equal((await readTask(task.id)).runCount, 0);
    assert.equal((await readTask(task.id)).sessionId, null);
  } finally {
    providerHook = null;
    await db.update(scheduledTasks).set({ status: 'paused' }).where(eq(scheduledTasks.id, task.id));
  }
});

test('ordinary provider failure settles a one-shot atomically instead of leaving a running lease', { skip: !enabled }, async () => {
  const [failingUser] = await db.insert(users).values({ email: `no-provider-${crypto.randomUUID()}@test.invalid`, passwordHash: 'test-only' }).returning();
  await db.insert(apiKeys).values({
    userId: failingUser.id,
    label: 'failing',
    url: 'https://invalid-provider.test.invalid/v1',
    model: 'test-model',
    keyCiphertext: encrypt('bad-key', encryptionKey()),
    isActive: true,
  });
  const task = await makeTask({ userId: failingUser.id });
  try {
    const result = await runScheduledTaskNow(task, { automatic: true });
    assert.equal(result.status, 'failed');
    assert.equal(result.runCount, 1);
    const [lease] = await db.select().from(scheduledTaskLeases).where(eq(scheduledTaskLeases.taskId, task.id));
    assert.equal(lease.state, 'failed');
  } finally { await db.delete(users).where(eq(users.id, task.userId)); }
});
