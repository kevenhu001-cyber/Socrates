import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidImagePayload } from '../src/services/embeddings/vision.js';

test('vision upload validation requires an allowed image MIME and matching file signature', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 0x43, 0, 8]);
  const webp = Buffer.from('RIFF0000WEBPVP8 ');
  const gif = Buffer.from('GIF89a0000');
  const bmp = Buffer.from('BM000000');

  assert.equal(isValidImagePayload('image/png', png), true);
  assert.equal(isValidImagePayload('image/jpeg', jpeg), true);
  assert.equal(isValidImagePayload('image/webp', webp), true);
  assert.equal(isValidImagePayload('image/gif', gif), true);
  assert.equal(isValidImagePayload('image/bmp', bmp), true);
  assert.equal(isValidImagePayload('text/html', Buffer.from('<script>')), false);
  assert.equal(isValidImagePayload('image/png', Buffer.from('<script>')), false);
});
