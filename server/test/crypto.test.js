// @ts-check
/**
 * Unit tests for src/lib/crypto.js — encryption helpers used by the
 * api_keys table. Encryption is a security boundary, so any
 * regression here is a P0.
 *
 * Run with: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  hashPassword, comparePassword,
  generateSessionToken, generateShareToken, generateShortToken,
  generateLoginCode,
  encrypt, decrypt, deriveEncryptionKey,
} from '../src/lib/crypto.js';

describe('crypto: session / share / verification token generators', () => {
  test('generateSessionToken returns 64 hex chars and is unique', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.match(b, /^[0-9a-f]{64}$/);
    assert.notEqual(a, b);
  });

  test('generateShareToken is base64url and 32 chars (24 bytes)', () => {
    const t = generateShareToken();
    assert.match(t, /^[A-Za-z0-9_-]{32}$/);
  });

  test('generateShortToken is 16 hex chars', () => {
    const t = generateShortToken();
    assert.match(t, /^[0-9a-f]{16}$/);
  });

  test('generateLoginCode is 8 chars, omits 0/O/1/I/l', () => {
    const code = generateLoginCode();
    assert.equal(code.length, 8);
    assert.match(code, /^[A-HJ-KM-NP-Z2-9]+$/, `unexpected char in code: ${code}`);
  });
});

describe('crypto: password hashing (bcrypt)', () => {
  test('hashPassword + comparePassword roundtrip', async () => {
    const hash = await hashPassword('correct horse battery staple');
    assert.notEqual(hash, 'correct horse battery staple');
    assert.match(hash, /^\$2[aby]\$/, 'should be a bcrypt hash');
    assert.equal(await comparePassword('correct horse battery staple', hash), true);
    assert.equal(await comparePassword('wrong', hash), false);
  });
});

describe('crypto: AES-256-GCM roundtrip', () => {
  test('encrypt + decrypt roundtrip returns the original plaintext', () => {
    const key = deriveEncryptionKey('test-secret-for-unit-tests');
    const plain = 'sk-very-secret-api-key-abcdef123456';
    const payload = encrypt(plain, key);
    assert.match(payload, /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/, 'expected iv:tag:ciphertext hex');
    assert.equal(decrypt(payload, key), plain);
  });

  test('decrypt rejects a tampered ciphertext', () => {
    const key = deriveEncryptionKey('test-secret-for-unit-tests');
    const payload = encrypt('hello', key);
    const [iv, tag, enc] = payload.split(':');
    // Flip a hex char in the ciphertext.
    const tampered = `${iv}:${tag}:${enc.slice(0, -1)}${enc.slice(-1) === '0' ? '1' : '0'}`;
    assert.throws(() => decrypt(tampered, key), /unsupported|auth/i);
  });

  test('decrypt rejects a tampered auth tag', () => {
    const key = deriveEncryptionKey('test-secret-for-unit-tests');
    const payload = encrypt('hello', key);
    const [iv, tag, enc] = payload.split(':');
    const tampered = `${iv}:${tag === '0'.repeat(tag.length) ? '1'.repeat(tag.length) : '0'.repeat(tag.length)}:${enc}`;
    assert.throws(() => decrypt(tampered, key));
  });

  test('decrypt with the wrong key throws (key isolation)', () => {
    const a = deriveEncryptionKey('user-A-secret');
    const b = deriveEncryptionKey('user-B-secret');
    const payload = encrypt('payload', a);
    assert.throws(() => decrypt(payload, b));
  });

  test('decrypt rejects a payload that does not have iv:tag:ciphertext shape', () => {
    const key = deriveEncryptionKey('any');
    assert.throws(() => decrypt('not-a-real-payload', key), /Invalid encrypted payload/);
    assert.throws(() => decrypt('only:two', key), /Invalid encrypted payload/);
  });

  test('deriveEncryptionKey returns a 32-byte buffer', () => {
    const k = deriveEncryptionKey('some-secret');
    // Node's crypto.hkdfSync returns an ArrayBuffer; Buffer.from
    // accepts either, so this normalises both shapes.
    assert.equal(Buffer.from(k).length, 32);
  });

  test('two distinct secrets derive distinct keys', () => {
    const a = deriveEncryptionKey('one');
    const b = deriveEncryptionKey('two');
    assert.notDeepEqual(Buffer.from(a), Buffer.from(b));
  });
});
