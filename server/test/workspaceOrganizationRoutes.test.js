// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { appRouteFixture } from './_appRouteFixture.js';
import { sessions, messages, sessionTags, tags, shares, prompts, projects } from '../src/db/schema/index.js';

const f = appRouteFixture();

 test('projects support isolated create/list/update/delete; invalid input and foreign ownership are non-mutating', async () => {
  const before = await f.request('/api/projects');
  assert.equal(before.status, 200);
  const missing = await f.request('/api/projects', { method: 'POST', body: {} });
  assert.equal(missing.status, 400); assert.equal(missing.body.code, 'BAD_REQUEST');
  const created = await f.request('/api/projects', { method: 'POST', body: { name: 'Coverage project', description: 'draft', color: 'blue' } });
  assert.equal(created.status, 201); assert.equal(created.body.name, 'Coverage project');
  assert.equal(created.body.userId, f.owner.id);
  assert.ok((await f.request('/api/projects')).body.projects.some((p) => p.id === created.body.id));
  assert.ok(!(await f.request('/api/projects', { as: f.other })).body.projects.some((p) => p.id === created.body.id));
  const denied = await f.request(`/api/projects/${created.body.id}`, { method: 'PATCH', as: f.other, body: { name: 'stolen' } });
  assert.equal(denied.status, 404); assert.equal(denied.body.code, 'NOT_FOUND');
  assert.equal((await f.db.select().from(projects).where(eq(projects.id, created.body.id)))[0].name, 'Coverage project');
  const changed = await f.request(`/api/projects/${created.body.id}`, { method: 'PATCH', body: { name: 'Renamed' } });
  assert.equal(changed.status, 200); assert.equal(changed.body.name, 'Renamed');
  assert.equal((await f.request(`/api/projects/${created.body.id}`, { method: 'DELETE', as: f.other })).status, 404);
  assert.equal((await f.request(`/api/projects/${created.body.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await f.db.select().from(projects).where(eq(projects.id, created.body.id))).length, 0);
});

test('prompts create with default category, list by owner, update and delete only own rows', async () => {
  const invalid = await f.request('/api/prompts', { method: 'POST', body: { title: 'incomplete' } });
  assert.equal(invalid.status, 400); assert.equal(invalid.body.code, 'BAD_REQUEST');
  const created = await f.request('/api/prompts', { method: 'POST', body: { title: 'My template', body: 'Do useful work' } });
  assert.equal(created.status, 201); assert.equal(created.body.category, 'other'); assert.equal(created.body.userId, f.owner.id);
  assert.ok((await f.request('/api/prompts?scope=mine')).body.templates.some((p) => p.id === created.body.id));
  assert.ok(!(await f.request('/api/prompts?scope=mine', { as: f.other })).body.templates.some((p) => p.id === created.body.id));
  const denied = await f.request(`/api/prompts/${created.body.id}`, { method: 'PATCH', as: f.other, body: { body: 'changed' } });
  assert.equal(denied.status, 404); assert.equal(denied.body.code, 'NOT_FOUND');
  assert.equal((await f.db.select().from(prompts).where(eq(prompts.id, created.body.id)))[0].body, 'Do useful work');
  const updated = await f.request(`/api/prompts/${created.body.id}`, { method: 'PATCH', body: { body: 'Updated body' } });
  assert.equal(updated.status, 200); assert.equal(updated.body.body, 'Updated body');
  assert.equal((await f.request(`/api/prompts/${created.body.id}`, { method: 'DELETE', as: f.other })).status, 204);
  assert.equal((await f.db.select().from(prompts).where(eq(prompts.id, created.body.id))).length, 1);
  assert.equal((await f.request(`/api/prompts/${created.body.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await f.db.select().from(prompts).where(eq(prompts.id, created.body.id))).length, 0);
});

test('session tag replacement validates array, creates vocabulary and links, and remains user-scoped', async () => {
  const [session] = await f.db.insert(sessions).values({ userId: f.owner.id, title: 'tag fixture' }).returning();
  const [otherSession] = await f.db.insert(sessions).values({ userId: f.other.id, title: 'foreign fixture' }).returning();
  const path = `/api/sessions/${session.id}/tags`;
  const invalid = await f.request(path, { method: 'PUT', body: { tags: 'not-array' } });
  assert.equal(invalid.status, 400); assert.equal(invalid.body.code, 'BAD_REQUEST');
  assert.equal((await f.db.select().from(sessionTags).where(eq(sessionTags.sessionId, session.id))).length, 0);
  const applied = await f.request(path, { method: 'PUT', body: { tags: ['research', 'urgent'] } });
  assert.equal(applied.status, 200); assert.deepEqual(applied.body.tags, ['research', 'urgent']);
  assert.deepEqual((await f.request('/api/')).body.tags.map((t) => t.name).sort(), ['research', 'urgent']);
  assert.deepEqual((await f.request('/api/', { as: f.other })).body.tags, []);
  assert.equal((await f.db.select().from(sessionTags).where(eq(sessionTags.sessionId, session.id))).length, 2);
  const replaced = await f.request(path, { method: 'PUT', body: { tags: ['urgent'] } });
  assert.equal(replaced.status, 200);
  assert.equal((await f.db.select().from(sessionTags).where(eq(sessionTags.sessionId, session.id))).length, 1);
  const denied = await f.request(`/api/sessions/${otherSession.id}/tags`, { method: 'PUT', body: { tags: ['intrude'] } });
  assert.equal(denied.status, 404); assert.equal(denied.body.code, 'NOT_FOUND');
  assert.equal((await f.db.select().from(tags).where(and(eq(tags.userId, f.other.id), eq(tags.name, 'intrude')))).length, 0);
});

test('share management is owner-bound and public share projection excludes private message fields', async () => {
  const [session] = await f.db.insert(sessions).values({ userId: f.owner.id, title: 'Shared title', topic: 'topic' }).returning();
  await f.db.insert(messages).values({ sessionId: session.id, role: 'assistant', content: 'Visible answer', rawText: 'Visible raw', attachments: [{ dataUrl: 'PRIVATE-LOCAL-TEST-DATA' }], html: '<secret>LOCAL</secret>' });
  const sharePath = `/api/sessions/${session.id}/share`;
  const created = await f.request(sharePath, { method: 'POST', body: { visibility: 'public' } });
  assert.equal(created.status, 201); assert.equal(created.body.visibility, 'public'); assert.ok(created.body.token);
  const token = created.body.token;
  assert.equal((await f.request(sharePath, { as: f.other })).body.token, null);
  const anonymous = await f.request(`/api/shares/${token}`, { as: null });
  assert.equal(anonymous.status, 200); assert.equal(anonymous.body.title, 'Shared title');
  assert.equal(anonymous.body.messages[0].content, 'Visible answer');
  assert.equal(JSON.stringify(anonymous.body).includes('PRIVATE-LOCAL-TEST-DATA'), false);
  assert.equal(JSON.stringify(anonymous.body).includes('<secret>'), false);
  const missing = await f.request('/api/shares/definitely-missing-local-token', { as: null });
  assert.equal(missing.status, 404); assert.equal(missing.body.code, 'NOT_FOUND');
  const changed = await f.request(sharePath, { method: 'POST', body: { visibility: 'private' } });
  assert.equal(changed.status, 201); assert.equal(changed.body.visibility, 'private');
  const blocked = await f.request(`/api/shares/${changed.body.token}`, { as: null });
  assert.equal(blocked.status, 403); assert.equal(blocked.body.code, 'PRIVATE');
  assert.equal((await f.request(`/api/shares/${changed.body.token}`, { as: f.owner })).status, 403);
});
