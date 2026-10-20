// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { appRouteFixture } from './_appRouteFixture.js';
import { sessions, usageEvents, mistakes, classroomClasses, messages, apiKeys, artifacts, artifactVersions, files, tags, sessionTags, users } from '../src/db/schema/index.js';
import { hashPassword } from '../src/lib/crypto.js';

const f = appRouteFixture();
let ownerSession;
let ownerMistake;
let otherMistake;
let klass;
let usageRows = [];

test('account usage is authenticated and returns user-scoped plan metrics', async () => {
  const unauth = await f.request('/api/account/usage', { as: null });
  assert.ok(unauth.status === 401 || unauth.status === 403);
  const res = await f.request('/api/account/usage');
  assert.equal(res.status, 200);
  assert.equal(res.body.user.id, f.owner.id);
  assert.equal(res.body.usage.sessionCount, 0);
  assert.equal(res.body.usage.beagleUsed, 0);
  assert.equal(res.body.plan.name, 'Diophantus');
});

test('heatmap clamps range, fills hourly gaps, and isolates usage by user', async () => {
  const now = new Date();
  usageRows = await f.db.insert(usageEvents).values([
    { userId: f.owner.id, totalTokens: 73, source: 'chat', createdAt: new Date(now.getTime() - 30 * 60_000) },
    { userId: f.owner.id, totalTokens: 27, source: 'agent', createdAt: new Date(now.getTime() - 30 * 60_000) },
    { userId: f.other.id, totalTokens: 9000, source: 'chat', createdAt: new Date(now.getTime() - 30 * 60_000) },
  ]).returning();
  const res = await f.request('/api/account/usage-heatmap?hours=1');
  assert.equal(res.status, 200);
  assert.equal(res.body.hours, 24);
  assert.equal(res.body.totalTokens, 100);
  assert.equal(res.body.totalCalls, 2);
  assert.equal(res.body.p95, 100);
  assert.equal(res.body.buckets.length, 25);
  const eventHour = Math.floor(usageRows[0].createdAt.getTime() / 3_600_000) * 3_600_000;
  const populated = res.body.buckets.filter((b) => b.tokens !== 0);
  assert.equal(populated.length, 1);
  assert.equal(new Date(populated[0].hour).getTime(), eventHour);
  assert.equal(populated[0].tokens, 100);
});

test('usage trend clamps days and only aggregates this user chat events', async () => {
  const res = await f.request('/api/account/usage-trend?days=2');
  assert.equal(res.status, 200);
  assert.equal(res.body.days, 7);
  assert.equal(res.body.totalTokens, 73);
  assert.equal(res.body.totalCalls, 1);
  assert.equal(res.body.entries.length, 8);
  const eventDay = usageRows[0].createdAt.toISOString().slice(0, 10);
  assert.equal(res.body.entries.find((entry) => entry.day === eventDay)?.tokens, 73);
});

test('export rejects missing and incorrect password reauthentication', async () => {
  const missing = await f.request('/api/account/export');
  assert.equal(missing.status, 401);
  assert.equal(missing.body.code, 'UNAUTHORIZED');
  const wrong = await f.request('/api/account/export', { headers: { 'X-Reauth-Password': 'wrong' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.code, 'UNAUTHORIZED');
  // Fixture's synthetic hash is intentionally not a password hash; export still
  // verifies that invalid credentials cannot produce an attachment.
});

test('account export contains populated owner data only and omits credentials and storage paths', async () => {
  const password = 'test-only-export-password';
  await f.db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, f.owner.id));
  const [ownSession] = await f.db.insert(sessions).values({ userId: f.owner.id, title: 'export-owned-session' }).returning();
  const [foreignSession] = await f.db.insert(sessions).values({ userId: f.other.id, title: 'foreign-session-must-not-export' }).returning();
  await f.db.insert(messages).values([
    { sessionId: ownSession.id, role: 'user', content: 'owned export message' },
    { sessionId: foreignSession.id, role: 'user', content: 'foreign message must not export' },
  ]);
  await f.db.insert(apiKeys).values([
    { userId: f.owner.id, label: 'owned-provider', url: 'https://provider.invalid', model: 'test-model', keyCiphertext: 'do-not-export-ciphertext' },
    { userId: f.other.id, label: 'foreign-provider', url: 'https://provider.invalid', model: 'test-model', keyCiphertext: 'foreign-ciphertext' },
  ]);
  const [ownArtifact] = await f.db.insert(artifacts).values({ userId: f.owner.id, type: 'code', title: 'owned artifact', source: 'owned source' }).returning();
  await f.db.insert(artifacts).values({ userId: f.other.id, type: 'code', title: 'foreign artifact', source: 'foreign source' });
  await f.db.insert(artifactVersions).values({ artifactId: ownArtifact.id, version: 1, source: 'owned version' });
  const [ownTag] = await f.db.insert(tags).values({ userId: f.owner.id, name: 'export-tag' }).returning();
  await f.db.insert(sessionTags).values({ sessionId: ownSession.id, tagId: ownTag.id });
  await f.db.insert(files).values({ userId: f.owner.id, name: 'owned.txt', mimeType: 'text/plain', size: 4, kind: 'text', sha256: 'test-sha', storagePath: '/private/storage/path' });

  const res = await f.request('/api/account/export', { headers: { 'X-Reauth-Password': password } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="socrates-data-[0-9a-f-]+-\d{4}-\d{2}-\d{2}\.json"$/);
  const body = JSON.parse(res.text);
  assert.equal(body.stats.sessionCount, 1);
  assert.equal(body.stats.messageCount, 1);
  assert.equal(body.stats.apiKeyCount, 1);
  assert.equal(body.stats.artifactCount, 1);
  assert.equal(body.sessions[0].id, ownSession.id);
  assert.deepEqual(body.messages.map((m) => m.content), ['owned export message']);
  assert.equal(body.apiKeys[0].label, 'owned-provider');
  assert.equal('keyCiphertext' in body.apiKeys[0], false);
  assert.equal(body.artifacts[0].title, 'owned artifact');
  assert.equal(body.artifactVersions[0].source, 'owned version');
  assert.equal(body.tags[0].name, 'export-tag');
  assert.equal(body.sessionTags[0].tagId, ownTag.id);
  assert.equal(body.files[0].name, 'owned.txt');
  assert.equal('storagePath' in body.files[0], false);
  assert.equal('passwordHash' in body.user, false);
  assert.doesNotMatch(res.text, /foreign-session-must-not-export|foreign message must not export|foreign-provider|foreign-ciphertext|do-not-export-ciphertext|\/private\/storage\/path|passwordHash/);
});

test('agent keys validate input, are owner-scoped, expose secret once, and revoke idempotently', async () => {
  const invalid = await f.request('/api/account/agent-keys', { method: 'POST', body: { label: 'x', scopes: [] } });
  assert.equal(invalid.status, 400);
  assert.equal((await f.request('/api/account/agent-keys', { method: 'POST', body: { label: '   ', scopes: ['sessions:read'] } })).status, 400);
  assert.equal((await f.request('/api/account/agent-keys', { method: 'POST', body: { label: 'a'.repeat(101), scopes: ['sessions:read'] } })).status, 400);
  assert.equal((await f.request('/api/account/agent-keys', { method: 'POST', body: { label: 'bad scope', scopes: ['not-a-scope'] } })).status, 400);
  assert.equal((await f.request('/api/account/agent-keys', { method: 'POST', body: { label: 'expired', scopes: ['sessions:read'], expiresAt: '2000-01-01T00:00:00Z' } })).status, 400);
  assert.equal((await f.request('/api/account/agent-keys', { method: 'POST', body: { label: 'invalid expiry', scopes: ['sessions:read'], expiresAt: 'not-a-date' } })).status, 400);
  assert.equal((await f.request('/api/account/agent-keys', { method: 'POST', body: { label: 'too long ttl', scopes: ['sessions:read'], expiresAt: new Date(Date.now() + 366 * 86400000).toISOString() } })).status, 400);
  const created = await f.request('/api/account/agent-keys', { method: 'POST', body: { label: '  test agent  ', scopes: ['sessions:read'] } });
  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.ok(created.body.credential);
  const [keyId, secret] = created.body.credential.split('.');
  assert.ok(keyId && secret);
  const listed = await f.request('/api/account/agent-keys');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.keys.length, 1);
  assert.equal(listed.body.keys[0].label, 'test agent');
  assert.equal('credential' in listed.body.keys[0], false);
  assert.equal('secretHash' in listed.body.keys[0], false);
  assert.equal((await f.request('/api/account/agent-keys', { as: f.other })).body.keys.length, 0);
  const id = listed.body.keys[0].id;
  assert.equal((await f.request(`/api/account/agent-keys/${id}/revoke`, { method: 'POST', as: f.other })).status, 404);
  assert.equal((await f.request(`/api/account/agent-keys/${id}/revoke`, { method: 'POST' })).status, 200);
  assert.equal((await f.request(`/api/account/agent-keys/${id}/revoke`, { method: 'POST' })).status, 200);
});

test('mistakes CRUD validates payload, resolves and prevents cross-user reads or mutation', async () => {
  const bad = await f.request('/api/mistakes', { method: 'POST', body: { questionContent: '' } });
  assert.equal(bad.status, 400);
  const created = await f.request('/api/mistakes', { method: 'POST', body: { questionContent: 'What is 2+2?', nodeName: 'arithmetic', source: 'manual' } });
  assert.equal(created.status, 201);
  ownerMistake = created.body.id;
  assert.equal(created.body.source, 'manual');
  const other = await f.request('/api/mistakes', { method: 'POST', as: f.other, body: { questionContent: 'private other' } });
  assert.equal(other.status, 201);
  otherMistake = other.body.id;
  const mine = await f.request('/api/mistakes?resolved=false&nodeName=arithmetic');
  assert.equal(mine.body.total, 1);
  assert.equal(mine.body.items[0].id, ownerMistake);
  assert.equal((await f.request(`/api/mistakes/${ownerMistake}`, { method: 'PATCH', as: f.other, body: { isResolved: true } })).status, 404);
  const resolved = await f.request(`/api/mistakes/${ownerMistake}`, { method: 'PATCH', body: { isResolved: true } });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.isResolved, true);
  assert.ok(resolved.body.resolvedAt);
  assert.equal((await f.request(`/api/mistakes/${ownerMistake}`, { method: 'DELETE', as: f.other })).status, 404);
  assert.equal((await f.request(`/api/mistakes/${ownerMistake}`, { method: 'DELETE' })).status, 204);
  assert.equal((await f.request(`/api/mistakes/${ownerMistake}`, { method: 'DELETE' })).status, 404);
});

test('knowledge boundary aggregates and updates only an owned session node', async () => {
  const [mine] = await f.db.insert(sessions).values({ userId: f.owner.id, title: 'private lesson', kbNodes: [
    { name: 'Fractions', status: 'fuzzy', questions: 4, history: [1, 2], user_note: 'old' },
    { name: 'Geometry', status: 'internalized' },
  ] }).returning();
  ownerSession = mine.id;
  const [theirs] = await f.db.insert(sessions).values({ userId: f.other.id, title: 'other lesson', kbNodes: [{ name: 'Secret', status: 'blank' }] }).returning();
  const invalid = await f.request('/api/knowledge-boundary?status=unknown');
  assert.equal(invalid.status, 400);
  const list = await f.request('/api/knowledge-boundary');
  assert.deepEqual(list.body.summary, { total: 2, fuzzy: 1, internalized: 1, blank: 0 });
  assert.deepEqual(list.body.items.map((n) => n.nodeName), ['Fractions', 'Geometry']);
  const updated = await f.request('/api/knowledge-boundary/node', { method: 'PATCH', body: { sessionId: ownerSession, nodeIndex: 0, confidenceScore: 5, userNote: 'reviewed' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.confidenceScore, 5);
  assert.equal(updated.body.userNote, 'reviewed');
  const forbidden = await f.request('/api/knowledge-boundary/node', { method: 'PATCH', body: { sessionId: theirs.id, nodeIndex: 0, userNote: 'tamper' } });
  assert.equal(forbidden.status, 400);
  assert.equal((await f.request('/api/knowledge-boundary/node', { method: 'PATCH', body: { sessionId: ownerSession, nodeIndex: 8 } })).status, 400);
});

test('classroom membership controls student and teacher-only dashboard routes', async () => {
  const missing = await f.request('/api/classroom/classes', { method: 'POST', body: {} });
  assert.equal(missing.status, 400);
  const created = await f.request('/api/classroom/classes', { method: 'POST', body: { name: 'Algebra', subject: 'Math' } });
  assert.equal(created.status, 201);
  klass = created.body;
  assert.ok(klass.joinCode);
  assert.equal((await f.request(`/api/classroom/classes/${klass.id}/students`, { as: f.other })).status, 403);
  assert.equal((await f.request(`/api/classroom/classes/${klass.id}/join`, { method: 'POST', as: f.other, body: { joinCode: 'wrong' } })).status, 403);
  assert.equal((await f.request(`/api/classroom/classes/${klass.id}/join`, { method: 'POST', as: f.other, body: { joinCode: klass.joinCode } })).status, 200);
  const students = await f.request(`/api/classroom/classes/${klass.id}/students`, { as: f.other });
  assert.equal(students.status, 200);
  assert.equal(students.body.students.length, 1);
  assert.equal(students.body.students[0].userId, f.other.id);
  assert.equal((await f.request(`/api/classroom/classes/${klass.id}/dashboard`, { as: f.other })).status, 403);
  const dashboard = await f.request(`/api/classroom/classes/${klass.id}/dashboard`);
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.students.length, 1);
});

test('knowledge boundary tolerates legacy node shapes, bounds history, and rejects edits to malformed nodes', async () => {
  const [legacy] = await f.db.insert(sessions).values({ userId: f.owner.id, title: null, kbNodes: [
    null, 7,
    { nodeName: 'Legacy', questions: 4, verifiedCount: 3, confidence_score: 4, system_note: 'review', user_note: 'original', history: Array.from({ length: 40 }, (_, i) => i) },
    { name: 'Future status', status: 'future-status', questions: 'not-a-count', history: 'not-an-array' },
    {},
  ] }).returning();
  const root = `/api/knowledge-boundary?sessionId=${legacy.id}`;
  const all = await f.request(root);
  assert.equal(all.status, 200);
  assert.deepEqual(all.body.summary, { total: 3, fuzzy: 0, internalized: 0, blank: 2 });
  const node = all.body.items.find((item) => item.nodeName === 'Legacy');
  assert.equal(node.sessionTitle, null);
  assert.equal(node.status, 'blank');
  assert.equal(node.verifiedCount, 3);
  assert.equal(node.confidenceScore, 4);
  assert.equal(node.systemNote, 'review');
  assert.equal(node.history.length, 30);
  assert.equal(node.history[0], 10);
  assert.equal(all.body.items.find((item) => item.nodeName === 'Future status').questions, 0);
  const filtered = await f.request(`${root}&status=blank`);
  assert.equal(filtered.body.items.length, 2);
  assert.ok(filtered.body.items.every((item) => item.status === 'blank'));
  assert.equal(filtered.body.summary.total, 3, 'summary describes the owned session before status filtering');
  assert.deepEqual((await f.request(root, { as: f.other })).body.items, []);
  assert.equal((await f.request('/api/knowledge-boundary?sessionId=invalid')).status, 400);
  for (const nodeIndex of [0, 1]) {
    assert.equal((await f.request('/api/knowledge-boundary/node', { method: 'PATCH', body: { sessionId: legacy.id, nodeIndex, userNote: 'invalid node' } })).status, 400);
  }
  const noted = await f.request('/api/knowledge-boundary/node', { method: 'PATCH', body: { sessionId: legacy.id, nodeIndex: 2, userNote: 'updated' } });
  assert.equal(noted.status, 200);
  assert.equal(noted.body.nodeName, 'Legacy');
  assert.equal(noted.body.confidenceScore, 4);
  assert.equal(noted.body.verifiedCount, 3);
  assert.equal(noted.body.systemNote, 'review');
  assert.equal(noted.body.userNote, 'updated');
  assert.equal(noted.body.history.length, 30);
  const unnamed = await f.request('/api/knowledge-boundary/node', { method: 'PATCH', body: { sessionId: legacy.id, nodeIndex: 4, confidenceScore: 0 } });
  assert.equal(unnamed.status, 200);
  assert.equal(unnamed.body.nodeName, null);
  assert.equal(unnamed.body.status, 'blank');
  assert.equal(unnamed.body.userNote, null);
  assert.deepEqual(unnamed.body.history, []);
});
