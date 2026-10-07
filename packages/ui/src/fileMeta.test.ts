import assert from 'node:assert/strict';
import test from 'node:test';
import { fileKindLabel, formatFileSize, isImageMime, storedFileIdFromRawUrl, storedFileIdsInText } from './fileMeta.ts';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

test('stored file raw URLs resolve to their file id', () => {
  assert.equal(storedFileIdFromRawUrl(`/api/files/${id}/raw`), id);
  assert.equal(storedFileIdFromRawUrl(`/api/v2/files/${id}/raw?inline=1`), id);
  assert.equal(storedFileIdFromRawUrl(`https://app.example.com/api/v2/files/${id}/raw`), id);
  assert.equal(storedFileIdFromRawUrl('/api/v2/files/not-a-uuid/raw'), null);
  assert.equal(storedFileIdFromRawUrl(`/api/v2/files/${id}/content`), null);
  assert.equal(storedFileIdFromRawUrl(`/api/v2/files/${id}`), null);
  assert.equal(storedFileIdFromRawUrl(''), null);
});

test('markdown text collects each referenced stored file once', () => {
  const text = `![a](/api/files/${id}/raw) and ![b](https://x.test/api/v2/files/${other}/raw) then ![a again](/api/files/${id}/raw)`;
  assert.deepEqual(storedFileIdsInText(text), [id, other]);
  assert.deepEqual(storedFileIdsInText('no files here'), []);
});

test('file sizes use compact binary units', () => {
  assert.equal(formatFileSize(0), '0 B');
  assert.equal(formatFileSize(999), '999 B');
  assert.equal(formatFileSize(1536), '1.5 KB');
  assert.equal(formatFileSize(5 * 1024 * 1024), '5 MB');
});

test('file kind labels prefer the extension and fall back to the mime type', () => {
  assert.equal(fileKindLabel('report.PDF', 'application/pdf'), 'PDF');
  assert.equal(fileKindLabel('archive.backup', 'application/octet-stream'), 'OCTET-STREAM');
  assert.equal(fileKindLabel('photo', 'image/png'), 'PNG');
  assert.equal(isImageMime('image/png'), true);
  assert.equal(isImageMime('application/pdf'), false);
  assert.equal(isImageMime(undefined), false);
});
