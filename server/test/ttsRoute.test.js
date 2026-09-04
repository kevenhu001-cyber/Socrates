// @ts-check
/**
 * Unit tests for routes/tts.ts — the cloud TTS proxy (M4 of the
 * LobeHub-alignment plan, with the M4 follow-up DB-backed persistence
 * wired in).
 *
 * Scope is the small pure surface: the body-shape guard
 * `readMessageId` and the `X-TTS-Cache: miss|hit` contract. The
 * full end-to-end behaviour (upstream fetch + DB lookup + persistence
 * upsert) is exercised by the running server in dev / e2e and does
 * not need a unit-test re-implementation here; adding an
 * `app.listen`-backed test would not add coverage beyond what the
 * existing in-memory LRU unit tests already pin in ttsCache.test.js.
 *
 * Run with: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readMessageId } from '../src/routes/tts.ts';

describe('tts route: readMessageId', () => {
  test('accepts a canonical UUID', () => {
    assert.equal(readMessageId('00000000-0000-0000-0000-0000000000c1'),
      '00000000-0000-0000-0000-0000000000c1');
  });

  test('accepts a hex-only id (32 hex chars, used by some SPA-side ids)', () => {
    assert.equal(readMessageId('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'),
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4');
  });

  test('trims surrounding whitespace', () => {
    assert.equal(readMessageId('  00000000-0000-0000-0000-0000000000c1  '),
      '00000000-0000-0000-0000-0000000000c1');
  });

  test('rejects empty / non-string values', () => {
    assert.equal(readMessageId(''), null);
    assert.equal(readMessageId('   '), null);
    assert.equal(readMessageId(null), null);
    assert.equal(readMessageId(undefined), null);
    assert.equal(readMessageId(42), null);
    assert.equal(readMessageId({ id: 'abc' }), null);
  });

  test('rejects ids that are too long (defence against 5 KB blobs in the body)', () => {
    const huge = 'a'.repeat(65);
    assert.equal(readMessageId(huge), null);
  });

  test('rejects ids that contain characters outside the hex / dash set', () => {
    assert.equal(readMessageId('hello world'), null);
    assert.equal(readMessageId('abc-../etc/passwd'), null);
    assert.equal(readMessageId("' OR 1=1; --"), null);
  });
});
