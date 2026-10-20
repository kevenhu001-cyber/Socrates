// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appRouteFixture } from './_appRouteFixture.js';

const f = appRouteFixture();
const base = '/api/scheduled-tasks';
let ownerTaskId;
let otherTaskId;

test('scheduled task routes require authentication', async () => {
  for (const [path, options] of [
    [base, {}],
    [base, { method: 'POST', body: { title: 'Unauthenticated' } }],
    [`${base}/00000000-0000-4000-8000-000000000001`, { method: 'PATCH', body: { title: 'No access' } }],
    [`${base}/00000000-0000-4000-8000-000000000001`, { method: 'DELETE' }],
  ]) {
    const response = await f.request(path, { ...options, as: null });
    assert.equal(response.status, 401, path);
  }
});

test('create validates required title, frequency, date, and referenced-resource ownership', async () => {
  for (const body of [
    {},
    { title: '   ' },
    { title: 'Bad frequency', frequency: 'every-minute' },
    { title: 'Bad date', nextRunAt: 'not-a-date' },
  ]) {
    const response = await f.request(base, { method: 'POST', body });
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  for (const body of [
    { title: 'Foreign project', projectId: '00000000-0000-4000-8000-000000000001' },
    { title: 'Foreign session', sessionId: '00000000-0000-4000-8000-000000000001' },
  ]) {
    const response = await f.request(base, { method: 'POST', body });
    assert.equal(response.status, 404, JSON.stringify(body));
  }
});

test('create persists safe task fields and lists each owner only their own tasks', async () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const created = await f.request(base, { method: 'POST', body: {
    title: '  Owner reminder  ', prompt: 'Summarize my notes', frequency: 'daily', nextRunAt: future,
    agentKind: 'unknown-agent', runPolicy: { allowedActions: ['read', 7], maxDurationMs: 9_999_999, sandbox: 'unsafe' },
    notificationConfig: { enabled: false, channels: ['email', 'push', 'extra', 'four', 'five', 'six'] },
  } });
  assert.equal(created.status, 201);
  ownerTaskId = created.body.id;
  assert.equal(created.body.userId, f.owner.id);
  assert.equal(created.body.title, 'Owner reminder');
  assert.equal(created.body.frequency, 'daily');
  assert.equal(created.body.status, 'active');
  assert.equal(created.body.agentKind, 'native');
  assert.deepEqual(created.body.runPolicy, { allowedActions: ['read', '7'], maxDurationMs: 900000 });
  assert.deepEqual(created.body.notificationConfig, { enabled: false, channels: ['email', 'push', 'extra', 'four', 'five'] });
  assert.equal(new Date(created.body.nextRunAt).toISOString(), future);

  const otherCreated = await f.request(base, { as: f.other, method: 'POST', body: { title: 'Other user task' } });
  assert.equal(otherCreated.status, 201);
  otherTaskId = otherCreated.body.id;
  assert.equal(otherCreated.body.userId, f.other.id);
  const ownerList = await f.request(base);
  const otherList = await f.request(base, { as: f.other });
  assert.equal(ownerList.status, 200);
  assert.deepEqual(ownerList.body.tasks.map((row) => row.id), [ownerTaskId]);
  assert.deepEqual(otherList.body.tasks.map((row) => row.id), [otherTaskId]);
});

test('patch validates fields, enforces owner isolation, and supports status transitions', async () => {
  assert.equal((await f.request(`${base}/${ownerTaskId}`, { as: f.other, method: 'PATCH', body: { title: 'Hijack' } })).status, 404);
  assert.equal((await f.request(`${base}/${otherTaskId}`, { as: f.owner, method: 'PATCH', body: { title: 'Foreign task' } })).status, 404);
  for (const body of [
    { frequency: 'quarterly' },
    { status: 'running' },
    { agentKind: 'unknown' },
    { nextRunAt: 'not-a-date' },
  ]) {
    const response = await f.request(`${base}/${ownerTaskId}`, { method: 'PATCH', body });
    assert.equal(response.status, 400, JSON.stringify(body));
  }

  const paused = await f.request(`${base}/${ownerTaskId}`, { method: 'PATCH', body: { title: 'Updated reminder', status: 'paused' } });
  assert.equal(paused.status, 200);
  assert.equal(paused.body.title, 'Updated reminder');
  assert.equal(paused.body.status, 'paused');
  const resumed = await f.request(`${base}/${ownerTaskId}`, { method: 'PATCH', body: { status: 'active' } });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.status, 'active');
  assert.ok(new Date(resumed.body.nextRunAt).getTime() > Date.now());
  const completed = await f.request(`${base}/${ownerTaskId}`, { method: 'PATCH', body: { status: 'completed', runPolicy: null, notificationConfig: [] } });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.status, 'completed');
  assert.deepEqual(completed.body.runPolicy, {});
  assert.deepEqual(completed.body.notificationConfig, { enabled: true, channels: [] });
});

test('delete is owner-scoped and removes the task from subsequent lists', async () => {
  const forbidden = await f.request(`${base}/${ownerTaskId}`, { as: f.other, method: 'DELETE' });
  assert.equal(forbidden.status, 204);
  assert.deepEqual((await f.request(base)).body.tasks.map((row) => row.id), [ownerTaskId]);
  assert.deepEqual((await f.request(base, { as: f.other })).body.tasks.map((row) => row.id), [otherTaskId]);
  assert.equal((await f.request(`${base}/${ownerTaskId}`, { method: 'DELETE' })).status, 204);
  assert.deepEqual((await f.request(base)).body.tasks, []);
  assert.equal((await f.request(`${base}/${otherTaskId}`, { as: f.other, method: 'DELETE' })).status, 204);
  assert.deepEqual((await f.request(base, { as: f.other })).body.tasks, []);
});
