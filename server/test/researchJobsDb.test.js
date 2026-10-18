import { before, after, test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { eq, sql } from 'drizzle-orm';
import { initDb, getDb, closeDb } from '../src/db/index.js';
import { users, authSessions, researchJobs, artifacts, sessions, projects, usageEvents, messages } from '../src/db/schema/index.js';
import { createResearchJob, claimResearchJob, saveResearchCheckpoint, renewResearchLease, getResearchJob, getResearchResult, listResearchEvents, controlResearchJob, publicResearchJob } from '../src/services/core/researchJobs.js';
import { runClaimedResearch, assertResearchBudget } from '../src/services/core/researchWorker.js';
import researchRouter from '../src/routes/researchJobs.js';
import { listen, httpRequest } from './_http.js';

describe('durable research (PostgreSQL)', { skip: !process.env.TEST_DATABASE_URL }, () => {
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const sid = randomBytes(32).toString('hex');
  let server;
  const submit = (extra = {}) => createResearchJob(userId, { query: 'Evidence question', idempotencyKey: randomUUID(), ...extra });
  before(async () => {
    initDb(process.env.TEST_DATABASE_URL);
    await getDb().insert(users).values([userId, otherUserId].map((id) => ({ id, email: `research-${id}@test.local`, passwordHash: 'test' })));
    await getDb().insert(authSessions).values({ userId, token: sid, expiresAt: new Date(Date.now() + 60_000) });
    const app = express();
    app.use(express.json(), cookieParser());
    app.use('/jobs', researchRouter);
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ code: error.code, error: error.message }));
    server = await listen(app);
  });
  after(async () => {
    await server?.close();
    await getDb().delete(users).where(eq(users.id, userId));
    await getDb().delete(users).where(eq(users.id, otherUserId));
    await closeDb();
  });

  test('concurrent submissions are idempotent and reject mismatched payloads', async () => {
    const idempotencyKey = randomUUID();
    const [a, b] = await Promise.all([submit({ idempotencyKey }), submit({ idempotencyKey })]);
    assert.equal(a.id, b.id);
    await assert.rejects(submit({ idempotencyKey, query: 'different' }), { code: 'CONFLICT' });
    await assert.rejects(getResearchJob(otherUserId, a.id), { code: 'NOT_FOUND' });
    await assert.rejects(listResearchEvents(otherUserId, a.id, 0), { code: 'NOT_FOUND' });
    assert.equal('leaseToken' in publicResearchJob(a), false);
    await controlResearchJob(userId, a.id, 'cancel');
  });

  test('foreign sessions/projects are rejected and active task quota covers retry', async () => {
    const [project] = await getDb().insert(projects).values({ userId: otherUserId, name: 'Private project' }).returning();
    const [session] = await getDb().insert(sessions).values({ userId: otherUserId, title: 'Private', topic: 'Private', projectId: project.id }).returning();
    await assert.rejects(submit({ sessionId: session.id, projectId: project.id }), { code: 'NOT_FOUND' });
    await assert.rejects(submit({ projectId: project.id }), { code: 'NOT_FOUND' });
    const cancelled = await submit();
    await controlResearchJob(userId, cancelled.id, 'cancel');
    const active = await Promise.all([submit(), submit(), submit()]);
    await assert.rejects(submit(), { code: 'CONFLICT' });
    await assert.rejects(controlResearchJob(userId, cancelled.id, 'retry'), { code: 'CONFLICT' });
    for (const job of active) await controlResearchJob(userId, job.id, 'cancel');
  });

  test('one worker claims, expired lease resumes, stale completion cannot create an artifact', async () => {
    const [session] = await getDb().insert(sessions).values({ userId, topic: 'Research', title: 'Research' }).returning();
    const submitted = await submit({ sessionId: session.id });
    const claims = await Promise.all([claimResearchJob(), claimResearchJob()]);
    assert.equal(claims.filter(Boolean).length, 1);
    const first = claims.find(Boolean);
    assert.equal(first.id, submitted.id);
    const steps = { plan: ['one', 'two'], searches: [[]] };
    await saveResearchCheckpoint(first, steps, 'searching');
    await getDb().update(researchJobs).set({ leaseExpiresAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(researchJobs.id, submitted.id));
    assert.equal(await renewResearchLease(first), false);
    const recovered = await claimResearchJob();
    assert.notEqual(first.leaseToken, recovered.leaseToken);
    assert.deepEqual(recovered.steps, steps);
    await assert.rejects(saveResearchCheckpoint(first, steps, 'completed', { report: 'stale report' }), { code: 'CONFLICT' });
    await saveResearchCheckpoint(recovered, { ...steps, report: 'Recovered report' }, 'completed', { report: 'Recovered report' });
    await assert.rejects(saveResearchCheckpoint(recovered, steps, 'completed', { report: 'duplicate' }), { code: 'CONFLICT' });
    const finished = await getResearchJob(userId, submitted.id);
    assert.equal(finished.status, 'succeeded');
    const [artifact] = await getDb().select().from(artifacts).where(eq(artifacts.id, finished.resultArtifactId));
    assert.equal(artifact.source, 'Recovered report');
    const message = await getResearchResult(userId, submitted.id);
    assert.equal(message.clientId, `research-${submitted.id}`);
    assert.equal(message.rawText, 'Recovered report');
    assert.equal(artifact.messageId, message.id);
    const companions = await getDb().select().from(artifacts).where(eq(artifacts.messageId, message.id));
    assert.equal(companions.length, 2);
    assert.deepEqual(companions.map((row) => row.type).sort(), ['latex', 'markdown']);
    await assert.rejects(getResearchResult(otherUserId, submitted.id), { code: 'NOT_FOUND' });
    const replay = await httpRequest(`${server.url}/jobs/${submitted.id}/result`, { cookies: { sid } });
    assert.equal(replay.body.message.id, message.id);
    await getDb().delete(messages).where(eq(messages.id, message.id));
    assert.equal(await getResearchResult(userId, submitted.id), null);
    const events = await listResearchEvents(userId, submitted.id, 0);
    assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3, 4, 5]);
    assert.equal(events.at(-1).status, 'succeeded');
  });

  test('cancellation fences an in-flight worker; retry continues saved work and errors are redacted', async () => {
    const submitted = await submit();
    const first = await claimResearchJob();
    await controlResearchJob(userId, submitted.id, 'cancel');
    await assert.rejects(saveResearchCheckpoint(first, {}, 'completed', { report: 'late' }), { code: 'CONFLICT' });
    await controlResearchJob(userId, submitted.id, 'retry');
    const retry = await claimResearchJob();
    await runClaimedResearch(retry, async () => { throw new Error('secret provider token'); });
    const failed = await getResearchJob(userId, submitted.id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error, 'research_execution_failed');
    await controlResearchJob(userId, submitted.id, 'retry');
    const resumed = await claimResearchJob();
    let calls = 0;
    await runClaimedResearch(resumed, async () => ({
      complete: async () => ++calls === 1 ? '["one","two"]' : 'Final report [1]',
      search: async () => [{ url: 'https://example.org', title: 'Evidence', content: 'Evidence' }],
      read: async (sources) => sources,
    }));
    assert.equal((await getResearchJob(userId, submitted.id)).status, 'succeeded');
  });

  test('HTTP auth, validation and Last-Event-ID replay work across disconnected subscribers', async () => {
    assert.equal((await httpRequest(`${server.url}/jobs`)).status, 401);
    const cookies = { sid };
    assert.equal((await httpRequest(`${server.url}/jobs/not-a-uuid`, { cookies })).status, 400);
    assert.equal((await httpRequest(`${server.url}/jobs`, { method: 'POST', cookies, body: { query: '' } })).status, 400);
    const created = await httpRequest(`${server.url}/jobs`, { method: 'POST', cookies, body: { query: 'HTTP research', idempotencyKey: randomUUID() } });
    assert.equal(created.status, 202);
    const id = created.body.job.id;
    const response = await fetch(`${server.url}/jobs/${id}/events`, { headers: { Cookie: `sid=${sid}` } });
    const reader = response.body.getReader();
    const first = await reader.read();
    assert.ok(first.value.length);
    await reader.cancel();
    assert.equal((await getResearchJob(userId, id)).status, 'queued');
    const job = await claimResearchJob();
    await saveResearchCheckpoint(job, { report: 'Background report' }, 'completed', { report: 'Background report' });
    const replay = await httpRequest(`${server.url}/jobs/${id}/events?after=0`, { cookies, headers: { 'Last-Event-ID': '1' } });
    assert.equal(replay.status, 200);
    assert.doesNotMatch(replay.text, /id: 1\n/);
    assert.match(replay.text, /id: 2\n/);
    assert.match(replay.text, /id: 3\n/);
    assert.match(replay.text, /succeeded/);
    assert.equal((await httpRequest(`${server.url}/jobs/${id}/events`, { cookies, headers: { 'Last-Event-ID': 'NaN' } })).status, 400);
    assert.equal((await httpRequest(`${server.url}/jobs/${id}/events?after=99`, { cookies })).status, 400);
  });

  test('repeated lease loss stops recovery at the attempt budget', async () => {
    const submitted = await submit();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const job = await claimResearchJob();
      assert.equal(job.id, submitted.id);
      assert.equal(job.attempts, attempt);
      await getDb().update(researchJobs).set({ leaseExpiresAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(researchJobs.id, job.id));
    }
    assert.equal(await claimResearchJob(), null);
    const failed = await getResearchJob(userId, submitted.id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error, 'research_recovery_exhausted');
    assert.equal(failed.leaseToken, null);
    const events = await listResearchEvents(userId, submitted.id, 0);
    assert.equal(events.at(-1).status, 'failed');
  });

  test('no-source retry searches again instead of replaying an empty checkpoint', async () => {
    const submitted = await submit();
    const job = await claimResearchJob();
    await saveResearchCheckpoint(job, { plan: ['one', 'two'], searches: [[], []] }, 'failed', { error: 'research_no_sources' });
    await controlResearchJob(userId, submitted.id, 'retry');
    const resumed = await claimResearchJob();
    assert.deepEqual(resumed.steps, { plan: ['one', 'two'] });
    await controlResearchJob(userId, submitted.id, 'cancel');
  });

  test('built-in research stops at the existing monthly account token budget', async () => {
    await assertResearchBudget(userId);
    await getDb().insert(usageEvents).values({ userId, source: 'research', totalTokens: 1_000_000, promptTokens: 900_000, completionTokens: 100_000 });
    await assert.rejects(assertResearchBudget(userId), /research_quota_exceeded/);
    await assertResearchBudget(otherUserId);
  });
});
