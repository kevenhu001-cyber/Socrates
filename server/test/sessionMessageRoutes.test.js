// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import { appRouteFixture } from './_appRouteFixture.js';
import { sessions, messages, artifacts, artifactVersions, feedback, mistakes, usageEvents, sessionPromptSnapshots } from '../src/db/schema/index.js';

const f = appRouteFixture();
async function session(user = f.owner, extra = {}) {
  const [row] = await f.db.insert(sessions).values({ userId: user.id, title: 'Route test', ...extra }).returning();
  return row;
}
async function message(s, extra = {}) {
  const [row] = await f.db.insert(messages).values({ sessionId: s.id, role: 'user', rawText: 'original', content: 'original', ...extra }).returning();
  return row;
}

test('session pagination is owner-scoped, excludes archived rows, and returns a lightweight projection', async () => {
  const first = await session(f.owner, { title: 'Newest', updatedAt: new Date('2026-01-03T00:00:00Z'), kbNodes: [{ name: 'private detail' }] });
  const second = await session(f.owner, { title: 'Older', updatedAt: new Date('2026-01-02T00:00:00Z') });
  await session(f.owner, { title: 'Archived', archivedAt: new Date() });
  await session(f.other, { title: 'Not mine' });
  assert.equal((await f.request('/api/sessions', { as: null })).status, 401);
  const page = await f.request('/api/sessions?limit=1');
  assert.equal(page.status, 200);
  assert.deepEqual(page.body.sessions.map((row) => row.id), [first.id]);
  assert.equal('kbNodes' in page.body.sessions[0], false);
  assert.equal('messages' in page.body.sessions[0], false);
  assert.ok(page.body.nextCursor);
  const next = await f.request(`/api/sessions?limit=1&cursor=${encodeURIComponent(page.body.nextCursor)}`);
  assert.equal(next.status, 200);
  assert.deepEqual(next.body.sessions.map((row) => row.id), [second.id]);
  assert.equal(next.body.nextCursor, null);
});

test('session detail retains message metadata without duplicating content and hides foreign ids', async () => {
  const s = await session();
  const m = await message(s, { clientId: 'client-detail', html: '<p>rendered</p>', attachments: [{ id: 'a', kind: 'file', name: 'note', mime: 'text/plain', size: 1 }] });
  await f.db.insert(sessionPromptSnapshots).values({ sessionId: s.id, userId: f.owner.id, systemPrompt: 'private-server-only-prompt' });
  const detail = await f.request(`/api/sessions/${s.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.id, s.id);
  assert.equal(JSON.stringify(detail.body).includes('private-server-only-prompt'), false);
  assert.equal(detail.body.messages[0].id, m.id);
  assert.equal(detail.body.messages[0].html, '<p>rendered</p>');
  assert.equal(detail.body.messages[0].clientId, 'client-detail');
  assert.deepEqual(detail.body.messages[0].attachments, m.attachments);
  assert.equal('content' in detail.body.messages[0], false);
  assert.equal((await f.request(`/api/sessions/${s.id}`, { as: f.other })).status, 404);
  assert.equal((await f.request('/api/sessions/not-a-uuid')).status, 404);
});

test('session metadata PATCH validates assistant ownership, supports clearing, and never transfers ownership', async () => {
  const s = await session();
  const assistants = await f.db.insert(artifacts).values([
    { userId: f.owner.id, type: 'assistant', source: '{"instructions":"help"}' },
    { userId: f.other.id, type: 'assistant', source: '{"instructions":"private"}' },
  ]).returning();
  assert.equal((await f.request(`/api/sessions/${s.id}`, { method: 'PATCH', as: f.other, body: { title: 'stolen' } })).status, 404);
  assert.equal((await f.request('/api/sessions/bad', { method: 'PATCH', body: {} })).status, 404);
  for (const assistantId of ['bad', assistants[1].id]) {
    assert.equal((await f.request(`/api/sessions/${s.id}`, { method: 'PATCH', body: { assistantId } })).status, 400);
  }
  const patched = await f.request(`/api/sessions/${s.id}`, { method: 'PATCH', body: { assistantId: assistants[0].id, pinned: true, title: 'Renamed', userId: f.other.id } });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.assistantId, assistants[0].id);
  assert.equal(patched.body.pinned, true);
  assert.equal(patched.body.title, 'Renamed');
  assert.equal(patched.body.userId, f.owner.id);
  const cleared = await f.request(`/api/sessions/${s.id}`, { method: 'PATCH', body: { assistantId: null } });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.assistantId, null);
});

test('archiving is owner-only, hides a session from recents, and can be undone', async () => {
  const s = await session();
  for (const method of ['POST', 'DELETE']) {
    assert.equal((await f.request(`/api/sessions/${s.id}/archive`, { method, as: f.other })).status, 404);
    assert.equal((await f.request('/api/sessions/bad/archive', { method })).status, 404);
  }
  assert.equal((await f.request(`/api/sessions/${s.id}/archive`, { method: 'POST' })).status, 200);
  assert.ok(!(await f.request('/api/sessions')).body.sessions.some((row) => row.id === s.id));
  assert.ok((await f.request('/api/sessions?archived=true')).body.sessions.some((row) => row.id === s.id));
  assert.equal((await f.request(`/api/sessions/${s.id}/archive`, { method: 'DELETE' })).status, 200);
  assert.ok((await f.request('/api/sessions')).body.sessions.some((row) => row.id === s.id));
});

test('message edits validate ownership and attachments, sanitize HTML, and resolve scoped client ids', async () => {
  const s = await session();
  const attachment = { id: 'note', kind: 'file', name: 'note.txt', mime: 'text/plain', size: 1 };
  const m = await message(s, { clientId: 'client-edit', attachments: [attachment] });
  const path = `/api/messages/${m.id}`;
  assert.equal((await f.request(path, { method: 'PATCH', body: {} })).status, 400);
  assert.equal((await f.request('/api/messages/bad', { method: 'PATCH', body: { content: 'x' } })).status, 400);
  assert.equal((await f.request(path, { method: 'PATCH', as: f.other, body: { content: 'x' } })).status, 404);
  const edited = await f.request(`/api/messages/client-edit?sessionId=${s.id}`, { method: 'PATCH', body: { content: '<b>safe</b><script>alert(1)</script>' } });
  assert.equal(edited.status, 200);
  let [stored] = await f.db.select().from(messages).where(eq(messages.id, m.id));
  assert.equal(stored.content.includes('<script'), false);
  assert.ok(stored.content.includes('safe'));
  assert.deepEqual(stored.attachments, [attachment]);
  const invalid = await f.request(path, { method: 'PATCH', body: { content: 'not saved', attachments: [{ size: -1 }] } });
  assert.equal(invalid.status, 400);
  [stored] = await f.db.select().from(messages).where(eq(messages.id, m.id));
  assert.notEqual(stored.content, 'not saved');
  assert.equal((await f.request(path, { method: 'PATCH', body: { content: 'cleared', attachments: [] } })).status, 200);
  [stored] = await f.db.select().from(messages).where(eq(messages.id, m.id));
  assert.deepEqual(stored.attachments, []);
});

test('discardFollowing rewinds all later roles, not only the next assistant answer', async () => {
  const s = await session();
  const before = await message(s, { createdAt: new Date('2026-01-01T00:00:00Z') });
  const edited = await message(s, { createdAt: new Date('2026-01-01T00:01:00Z') });
  const later = await f.db.insert(messages).values(['assistant', 'user', 'tool'].map((role, i) => ({ sessionId: s.id, role, rawText: 'stale', content: 'stale', createdAt: new Date(Date.UTC(2026, 0, 1, 0, i + 2)) }))).returning();
  const response = await f.request(`/api/messages/${edited.id}`, { method: 'PATCH', body: { content: 'edited', discardFollowing: true } });
  assert.equal(response.status, 200);
  const remaining = await f.db.select().from(messages).where(eq(messages.sessionId, s.id));
  assert.deepEqual(remaining.map((row) => row.id).sort(), [before.id, edited.id].sort());
  assert.equal(remaining.some((row) => later.some((stale) => stale.id === row.id)), false);
});

test('feedback upserts on the owned message, rejects invalid ratings, and message deletion is owner-only', async () => {
  const s = await session();
  const m = await message(s, { clientId: 'client-feedback' });
  const path = `/api/messages/${m.id}/feedback`;
  assert.equal((await f.request(path, { method: 'PUT', body: { rating: 'invalid' } })).status, 400);
  assert.equal((await f.request(path, { method: 'PUT', as: f.other, body: { rating: 'up' } })).status, 404);
  for (const rating of ['up', 'down', 'none']) {
    assert.equal((await f.request(path, { method: 'PUT', body: { rating, reason: rating === 'down' ? 'incorrect' : undefined } })).status, 200);
    const rows = await f.db.select().from(feedback).where(eq(feedback.messageId, m.id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].rating, rating);
  }
  assert.equal((await f.request(`/api/messages/${m.id}`, { method: 'DELETE', as: f.other })).status, 404);
  assert.equal((await f.request(`/api/messages/client-feedback?sessionId=${s.id}`, { method: 'DELETE' })).status, 204);
  assert.deepEqual(await f.db.select().from(messages).where(eq(messages.id, m.id)), []);
  assert.deepEqual(await f.db.select().from(feedback).where(eq(feedback.messageId, m.id)), []);
});

test('session purge removes related content and bulk clear preserves archived and foreign sessions', async () => {
  const s = await session();
  const [a] = await f.db.insert(artifacts).values({ userId: f.owner.id, sessionId: s.id, type: 'note', source: 'private' }).returning();
  await f.db.insert(artifactVersions).values({ artifactId: a.id, version: 1, source: 'private', createdBy: f.owner.id });
  await message(s);
  await f.db.insert(mistakes).values({ userId: f.owner.id, sessionId: s.id, questionContent: 'private' });
  await f.db.insert(usageEvents).values({ userId: f.owner.id, sessionId: s.id, source: 'chat', totalTokens: 1 });
  assert.equal((await f.request(`/api/sessions/${s.id}`, { method: 'DELETE', as: f.other })).status, 404);
  assert.equal((await f.request(`/api/sessions/${s.id}`, { method: 'DELETE' })).status, 204);
  for (const [table, column, id] of [[artifacts, artifacts.id, a.id], [artifactVersions, artifactVersions.artifactId, a.id], [messages, messages.sessionId, s.id], [mistakes, mistakes.sessionId, s.id], [usageEvents, usageEvents.sessionId, s.id]]) {
    assert.deepEqual(await f.db.select().from(table).where(eq(column, id)), []);
  }
  const archived = await session(f.owner, { archivedAt: new Date() });
  const foreign = await session(f.other);
  const cleared = await f.request('/api/sessions', { method: 'DELETE' });
  assert.equal(cleared.status, 200);
  assert.ok(cleared.body.deleted > 0);
  const preserved = await f.db.select().from(sessions).where(inArray(sessions.id, [archived.id, foreign.id]));
  assert.equal(preserved.length, 2);
  assert.deepEqual((await f.request('/api/sessions', { method: 'DELETE' })).body, { ok: true, deleted: 0 });
});

/* ─── R7: GET /api/sessions/:id/messages cursor pagination ─── */

test('message page returns the newest tail by default, oldest-last, with a stitching cursor', async () => {
  const s = await session(f.owner, { title: 'Paged' });
  const base = Date.UTC(2026, 0, 1, 12, 0, 0);
  const rows = [];
  for (let i = 0; i < 5; i++) {
    rows.push(await message(s, { rawText: 'm' + i, content: 'm' + i, createdAt: new Date(base + i * 1000) }));
  }
  assert.equal((await f.request(`/api/sessions/${s.id}/messages`, { as: f.other })).status, 404);
  assert.equal((await f.request('/api/sessions/not-a-uuid/messages')).status, 404);

  const page1 = await f.request(`/api/sessions/${s.id}/messages?limit=3`);
  assert.equal(page1.status, 200);
  assert.deepEqual(page1.body.messages.map((m) => m.rawText), ['m2', 'm3', 'm4']);
  assert.equal(page1.body.hasMore, true);
  assert.equal(page1.body.cursor.createdAt, new Date(base + 2000).toISOString());
  assert.equal(page1.body.cursor.id, rows[2].id);
  /* Shape parity with GET /:id: same projection (no `content` column). */
  assert.equal(page1.body.messages[0].id, rows[2].id);
  assert.equal('content' in page1.body.messages[0], false);

  const page2 = await f.request(`/api/sessions/${s.id}/messages?limit=3&before=${encodeURIComponent(page1.body.cursor.createdAt)}&beforeId=${page1.body.cursor.id}`);
  assert.equal(page2.status, 200);
  assert.deepEqual(page2.body.messages.map((m) => m.rawText), ['m0', 'm1']);
  assert.equal(page2.body.hasMore, false);
  assert.equal(page2.body.cursor, null);
});

test('message page total-orders created_at ties by id so pages partition exactly', async () => {
  const s = await session(f.owner, { title: 'Ties' });
  const stamp = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
  /* Four rows sharing one timestamp: page boundaries must never skip or
     duplicate a tie-mate (the created_at-only cursor would). */
  const tieRows = [];
  for (let i = 0; i < 4; i++) {
    tieRows.push(await message(s, { rawText: 't' + i, content: 't' + i, createdAt: stamp }));
  }
  const collected = [];
  let cursor = null;
  for (let guard = 0; guard < 10; guard++) {
    const url = cursor
      ? `/api/sessions/${s.id}/messages?limit=2&before=${encodeURIComponent(cursor.createdAt)}&beforeId=${cursor.id}`
      : `/api/sessions/${s.id}/messages?limit=2`;
    const page = await f.request(url);
    assert.equal(page.status, 200);
    collected.push(...page.body.messages.map((m) => m.rawText));
    if (!page.body.hasMore) break;
    cursor = page.body.cursor;
  }
  /* Newest-first walk collects ids descending within the tie; the set must
     partition exactly. */
  assert.deepEqual(collected.slice().sort(), ['t0', 't1', 't2', 't3']);
  assert.equal(new Set(collected).size, 4, 'no tie-mate skipped or duplicated');
});

test('message page clamps limit and validates cursor params', async () => {
  const s = await session(f.owner, { title: 'Clamp' });
  for (let i = 0; i < 3; i++) await message(s, { rawText: 'c' + i, content: 'c' + i, createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, 0) + i * 1000) });
  const clamped = await f.request(`/api/sessions/${s.id}/messages?limit=1000`);
  assert.equal(clamped.status, 200);
  assert.equal(clamped.body.messages.length, 3);
  assert.equal((await f.request(`/api/sessions/${s.id}/messages?before=${encodeURIComponent('2026-01-01T00:00:00Z')}`)).status, 400);
  assert.equal((await f.request(`/api/sessions/${s.id}/messages?beforeId=${f.owner.id}`)).status, 400);
  assert.equal((await f.request(`/api/sessions/${s.id}/messages?before=not-a-date&beforeId=${f.owner.id}`)).status, 400);
  assert.equal((await f.request(`/api/sessions/${s.id}/messages?before=${encodeURIComponent('2026-01-01T00:00:00Z')}&beforeId=not-a-uuid`)).status, 400);
  /* A syntactically valid uuid that references no row is fine: the cursor is
     only compared, never joined — the page is simply empty. */
  const empty = await f.request(`/api/sessions/${s.id}/messages?limit=1&before=${encodeURIComponent('2020-01-01T00:00:00Z')}&beforeId=${f.owner.id}`);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.messages, []);
  assert.equal(empty.body.hasMore, false);
  assert.equal(empty.body.cursor, null);
});
