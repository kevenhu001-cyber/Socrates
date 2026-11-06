// @ts-check
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const scratch = await mkdtemp(path.join(os.tmpdir(), 'socrates-upload-storage-'));
process.env.UPLOAD_DIR = path.join(scratch, 'uploads');
const { UPLOAD_DIR, ensureUploadDirectory } = await import('../src/lib/uploadStorage.js');

after(async () => {
  await rm(scratch, { recursive: true, force: true });
});

test('upload storage is created with owner-only directory permissions', async () => {
  await ensureUploadDirectory();
  const directory = await stat(UPLOAD_DIR);
  assert.equal(directory.mode & 0o777, 0o700);
});
