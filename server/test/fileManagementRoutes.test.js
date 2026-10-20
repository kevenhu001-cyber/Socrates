// @ts-check
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Routes capture their disk locations at import time; keep every test byte in
// this run's own directory and remove it regardless of test outcome.
const scratch = await mkdtemp(path.join(os.tmpdir(), 'socrates-file-routes-'));
process.env.UPLOAD_DIR = path.join(scratch, 'uploads');
process.env.NODE_ENV = 'test';
const { appRouteFixture } = await import('./_appRouteFixture.js');
const f = appRouteFixture();
const endpoint = '/api/files';

async function multipart(pathname, as, content, filename, type = 'text/plain') {
  const form = new FormData();
  if (content !== null) form.append('file', new Blob([content], { type }), filename);
  return fetch(`${f.url}${pathname}`, {
    method: 'POST',
    headers: { Cookie: `sid=${as.sid}; csrf=${as.csrf}`, 'X-CSRF-Token': as.csrf },
    body: form,
  }).then(async (r) => ({ status: r.status, headers: r.headers, body: await r.json().catch(() => null) }));
}

after(async () => {
  await rm(scratch, { recursive: true, force: true });
});

test('file routes require authentication and isolate lists and metadata by owner', async () => {
  assert.equal((await f.request(endpoint, { as: null })).status, 401);
  const uploaded = await multipart(endpoint, f.owner, 'owned notes\r\nsecond line', 'notes.txt');
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.name, 'notes.txt');
  assert.equal(uploaded.body.kind, 'text');
  assert.match(uploaded.body.sha256, /^[a-f0-9]{64}$/);
  const id = uploaded.body.id;
  assert.equal((await f.request(`${endpoint}/${id}`, { as: null })).status, 401);
  assert.equal((await f.request(`${endpoint}/${id}`, { as: f.other })).status, 404);
  const metadata = await f.request(`${endpoint}/${id}`);
  assert.equal(metadata.body.id, id);
  assert.equal(metadata.body.userId, f.owner.id);
  assert.equal((await f.request(`${endpoint}/${id}/content`, { as: f.other })).status, 404);
  const preview = await f.request(`${endpoint}/${id}/content`);
  assert.equal(preview.body.text, 'owned notes\nsecond line');
  assert.equal((await f.request(endpoint, { as: f.other })).body.files.some((x) => x.id === id), false);
  assert.equal((await f.request(`${endpoint}/${id}/raw`, { as: f.other })).status, 404);
  assert.equal((await f.request(`${endpoint}/${id}/raw`)).status, 200);
  assert.equal((await f.request(`${endpoint}/${id}`, { method: 'DELETE' })).status, 204);
});

test('owned file listing uses cursor pagination and rename/delete affect only owned files', async () => {
  const first = await multipart(endpoint, f.owner, 'first', 'first.txt');
  const second = await multipart(endpoint, f.owner, 'second', 'second.txt');
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  const listed = await f.request(`${endpoint}?limit=1`);
  assert.equal(listed.body.files.length, 1);
  assert.ok(listed.body.nextCursor);
  const next = await f.request(`${endpoint}?limit=1&cursor=${listed.body.nextCursor}`);
  assert.equal(next.body.files.length, 1);
  assert.notEqual(next.body.files[0].id, listed.body.files[0].id);
  assert.ok(next.body.nextCursor === null || typeof next.body.nextCursor === 'string');
  assert.equal((await f.request(`${endpoint}/${first.body.id}`, { method: 'PATCH', as: f.other, body: { name: 'stolen.txt' } })).status, 404);
  const renamed = await f.request(`${endpoint}/${first.body.id}`, { method: 'PATCH', body: { name: '../renamed.txt' } });
  assert.equal(renamed.body.name, 'renamed.txt');
  const normalized = await f.request(`${endpoint}/${first.body.id}`, { method: 'PATCH', body: { name: 'bad/name.txt' } });
  assert.equal(normalized.status, 200);
  assert.equal(normalized.body.name, 'name.txt');
  assert.equal((await f.request(`${endpoint}/${second.body.id}`, { method: 'DELETE', as: f.other })).status, 404);
  assert.equal((await f.request(`${endpoint}/${second.body.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await f.request(`${endpoint}/${second.body.id}`)).status, 404);
});

test('uploads reject absent or active-content files and accept safe text; extraction is auth protected and cleans parse failures', async () => {
  assert.equal((await multipart(endpoint, f.owner, null, '')).status, 400);
  assert.equal((await multipart(endpoint, f.owner, '<svg onload=alert(1)>', 'bad.svg', 'image/svg+xml')).status, 400);
  assert.equal((await multipart(endpoint, f.owner, '<html>active</html>', 'bad.png', 'image/png')).status, 400);
  assert.equal((await f.request(`${endpoint}/extract`, { as: null, method: 'POST' })).status, 401);
  const unsupported = await multipart(`${endpoint}/extract`, f.owner, 'hello', 'x.txt', 'text/plain');
  assert.equal(unsupported.status, 400);
  // A deliberately malformed document exercises the real parser error path,
  // without external services/models or a mocked router.
  const brokenDoc = await multipart(`${endpoint}/extract`, f.owner, 'not a zip document', 'broken.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(brokenDoc.status, 200);
  assert.equal(brokenDoc.body.ok, false);
  assert.equal(brokenDoc.body.kind, 'docx');
  assert.ok(brokenDoc.body.errorCode);
});
