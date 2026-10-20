// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appRouteFixture } from './_appRouteFixture.js';
import { files } from '../src/db/schema/index.js';

const f = appRouteFixture();

test('file pagination follows timestamp/id ordering without dropping owner scope or accepting a foreign cursor', async () => {
  // Deliberately make UUID order disagree with upload order. UUIDs are random
  // in production, so comparing the cursor ID alone cannot implement this order.
  const newest = '00000000-0000-4000-8000-000000000002';
  const older = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const tied = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const foreign = '00000000-0000-4000-8000-000000000001';
  await f.db.insert(files).values([
    { id: newest, userId: f.owner.id, name: 'new.txt', mimeType: 'text/plain', size: 1, kind: 'text', sha256: 'a'.repeat(64), storagePath: '/unused/new', uploadedAt: new Date('2026-10-19T12:00:00Z') },
    { id: older, userId: f.owner.id, name: 'old.txt', mimeType: 'text/plain', size: 1, kind: 'text', sha256: 'a'.repeat(64), storagePath: '/unused/old', uploadedAt: new Date('2026-10-18T12:00:00Z') },
    { id: tied, userId: f.owner.id, name: 'tie.txt', mimeType: 'text/plain', size: 1, kind: 'text', sha256: 'a'.repeat(64), storagePath: '/unused/tie', uploadedAt: new Date('2026-10-18T12:00:00Z') },
    { id: foreign, userId: f.other.id, name: 'private.txt', mimeType: 'text/plain', size: 1, kind: 'text', sha256: 'a'.repeat(64), storagePath: '/unused/private', uploadedAt: new Date('2026-10-17T12:00:00Z') },
  ]);
  const first = await f.request('/api/files?limit=1');
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.files.map((row) => row.id), [newest]);
  assert.equal(first.body.nextCursor, newest);

  const second = await f.request(`/api/files?limit=1&cursor=${first.body.nextCursor}`);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body.files.map((row) => row.id), [older],
    'the next page must contain the older owned file, never the foreign file');
  assert.equal(second.body.nextCursor, older);
  const third = await f.request(`/api/files?limit=1&cursor=${older}`);
  assert.equal(third.status, 200);
  assert.deepEqual(third.body.files.map((row) => row.id), [tied]);
  assert.equal(third.body.nextCursor, null);
  const end = await f.request(`/api/files?limit=1&cursor=${tied}`);
  assert.deepEqual(end.body.files, []);
  assert.equal(end.body.nextCursor, null);

  const foreignCursor = await f.request(`/api/files?limit=1&cursor=${foreign}`);
  assert.equal(foreignCursor.status, 200);
  assert.deepEqual(foreignCursor.body.files, [], 'foreign cursor must not select another user\'s records');
  const missing = await f.request('/api/files?limit=1&cursor=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.deepEqual(missing.body.files, []);
});
