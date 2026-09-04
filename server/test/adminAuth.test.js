// @ts-check
/**
 * Unit tests for services/adminAuth.ts — the independent password
 * credential for the /admin operator console.
 *
 * Pins: the token sign/verify round-trip, the expiry enforcement,
 * the tamper rejection, and the fail-closed password check when
 * ADMIN_PASSWORD is unset or too short.
 *
 * Run with: npm test
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/* sessionSecret() refuses to derive keys from the publicly known
   dev default unless SOCRATES_ALLOW_DEV_SECRET=1 is set. The admin
   token signer uses SESSION_SECRET, so the suite opts into the dev
   secret before the first import that reaches lib/crypto. */
process.env.SOCRATES_ALLOW_DEV_SECRET = process.env.SOCRATES_ALLOW_DEV_SECRET || '1';

const {
  adminPasswordConfigured,
  verifyAdminPassword,
  issueAdminSessionToken,
  verifyAdminSessionToken,
  extractAdminToken,
} = await import('../src/services/adminAuth.js');

describe('adminAuth — password gate', () => {
  const original = process.env.ADMIN_PASSWORD;

  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = original;
  });

  test('adminPasswordConfigured is false when unset or too short', () => {
    delete process.env.ADMIN_PASSWORD;
    assert.equal(adminPasswordConfigured(), false);
    process.env.ADMIN_PASSWORD = 'short';
    assert.equal(adminPasswordConfigured(), false);
    process.env.ADMIN_PASSWORD = 'long-enough-password';
    assert.equal(adminPasswordConfigured(), true);
  });

  test('verifyAdminPassword fails closed when not configured', async () => {
    delete process.env.ADMIN_PASSWORD;
    assert.equal(await verifyAdminPassword('anything'), false);
  });

  test('verifyAdminPassword accepts the configured password, rejects others', async () => {
    process.env.ADMIN_PASSWORD = 'correct-operator-password';
    assert.equal(await verifyAdminPassword('correct-operator-password'), true);
    assert.equal(await verifyAdminPassword('wrong-password'), false);
    assert.equal(await verifyAdminPassword(''), false);
    assert.equal(await verifyAdminPassword('x'.repeat(201)), false);
  });
});

describe('adminAuth — session token', () => {
  test('round-trips: issue then verify', () => {
    const token = issueAdminSessionToken();
    assert.equal(verifyAdminSessionToken(token), true);
  });

  test('rejects a tampered payload (signature mismatch)', () => {
    const token = issueAdminSessionToken();
    const parts = token.split('.');
    /* Flip a character in the random part — the signature no longer
       matches. */
    const flipped = (parts[0][0] === 'a' ? 'b' : 'a') + parts[0].slice(1);
    assert.equal(verifyAdminSessionToken(`${flipped}.${parts[1]}.${parts[2]}`), false);
  });

  test('rejects a token with an edited expiry (replay past TTL)', () => {
    const token = issueAdminSessionToken();
    const parts = token.split('.');
    /* Push the expiry far into the future without re-signing. */
    const future = String(Date.now() + 10 * 86400000);
    assert.equal(verifyAdminSessionToken(`${parts[0]}.${future}.${parts[2]}`), false);
  });

  test('rejects a malformed token (wrong segment count)', () => {
    assert.equal(verifyAdminSessionToken('not-a-token'), false);
    assert.equal(verifyAdminSessionToken('a.b'), false);
    assert.equal(verifyAdminSessionToken(null), false);
    assert.equal(verifyAdminSessionToken(42), false);
  });
});

describe('adminAuth — token extraction', () => {
  test('prefers the X-Admin-Token header over the cookie', () => {
    const req = {
      headers: { 'x-admin-token': 'header-token' },
      cookies: { socrates_admin_session: 'cookie-token' },
    };
    assert.equal(extractAdminToken(req), 'header-token');
  });

  test('falls back to the cookie when the header is absent', () => {
    const req = {
      headers: {},
      cookies: { socrates_admin_session: 'cookie-token' },
    };
    assert.equal(extractAdminToken(req), 'cookie-token');
  });

  test('returns null when neither source has a token', () => {
    assert.equal(extractAdminToken({ headers: {}, cookies: {} }), null);
    assert.equal(extractAdminToken({ headers: {} }), null);
  });
});
