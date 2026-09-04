// @ts-check
/**
 * Unit tests for services/adminAuth.ts — the independent password
 * credential for the /admin operator console (production hardening).
 *
 * Pins the five defence layers:
 *   1. IP allowlist parsing + CIDR / exact / IPv6-mapped matching
 *   2. Per-IP lockout key derivation (::ffff: normalisation)
 *   3. Slow-hash verification (bcrypt) with rotation and fail-closed
 *   4. Domain-separated token signing + tamper / expiry / purpose checks
 *   5. Token extraction precedence
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
  _resetAdminPasswordMemo,
  isAdminIpAllowed,
  parseAdminIpAllowlist,
  adminLockoutKey,
  issueAdminSessionToken,
  verifyAdminSessionToken,
  extractAdminToken,
} = await import('../src/services/adminAuth.js');

describe('adminAuth — IP allowlist (layer 1)', () => {
  const original = process.env.ADMIN_IP_ALLOWLIST;

  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_IP_ALLOWLIST;
    else process.env.ADMIN_IP_ALLOWLIST = original;
  });

  test('unset allowlist allows every IP', () => {
    delete process.env.ADMIN_IP_ALLOWLIST;
    assert.equal(isAdminIpAllowed('203.0.113.7'), true);
    assert.equal(isAdminIpAllowed(null), true);
    assert.equal(isAdminIpAllowed(undefined), true);
  });

  test('set allowlist blocks non-listed IPs and missing IP', () => {
    process.env.ADMIN_IP_ALLOWLIST = '203.0.113.7';
    assert.equal(isAdminIpAllowed('203.0.113.7'), true);
    assert.equal(isAdminIpAllowed('203.0.113.8'), false);
    assert.equal(isAdminIpAllowed(null), false);
    assert.equal(isAdminIpAllowed(undefined), false);
  });

  test('IPv4 CIDR ranges match the whole range', () => {
    process.env.ADMIN_IP_ALLOWLIST = '203.0.113.0/24';
    assert.equal(isAdminIpAllowed('203.0.113.1'), true);
    assert.equal(isAdminIpAllowed('203.0.113.254'), true);
    assert.equal(isAdminIpAllowed('203.0.114.1'), false);
  });

  test('multiple entries are OR-ed', () => {
    process.env.ADMIN_IP_ALLOWLIST = '203.0.113.7, 198.51.100.0/28';
    assert.equal(isAdminIpAllowed('203.0.113.7'), true);
    assert.equal(isAdminIpAllowed('198.51.100.9'), true);
    assert.equal(isAdminIpAllowed('198.51.100.31'), false); // outside /28
    assert.equal(isAdminIpAllowed('192.0.2.1'), false);
  });

  test('IPv6-mapped v4 (::ffff:) is normalised for v4 entries', () => {
    process.env.ADMIN_IP_ALLOWLIST = '203.0.113.7';
    assert.equal(isAdminIpAllowed('::ffff:203.0.113.7'), true);
    assert.equal(isAdminIpAllowed('::ffff:203.0.113.8'), false);
  });

  test('IPv6 exact string match works; malformed entries never match', () => {
    process.env.ADMIN_IP_ALLOWLIST = '2001:db8::1, not-an-ip';
    assert.equal(isAdminIpAllowed('2001:db8::1'), true);
    assert.equal(isAdminIpAllowed('2001:db8::2'), false);
    assert.equal(isAdminIpAllowed('anything'), false);
  });

  test('empty / whitespace-only allowlist is treated as unset (allow all)', () => {
    process.env.ADMIN_IP_ALLOWLIST = '   ';
    assert.equal(isAdminIpAllowed('203.0.113.7'), true);
    assert.equal(parseAdminIpAllowlist(), null);
  });

  test('parseAdminIpAllowlist rejects an invalid prefix length', () => {
    process.env.ADMIN_IP_ALLOWLIST = '203.0.113.0/33';
    const list = parseAdminIpAllowlist();
    assert.ok(list);
    assert.equal(list[0].prefix, null);
  });
});

describe('adminAuth — lockout key (layer 2)', () => {
  test('namespaced per-IP key with ::ffff: normalisation', () => {
    assert.equal(adminLockoutKey('203.0.113.7'), 'admin-ip:203.0.113.7');
    assert.equal(adminLockoutKey('::ffff:203.0.113.7'), 'admin-ip:203.0.113.7');
    assert.equal(adminLockoutKey(null), null);
    assert.equal(adminLockoutKey(undefined), null);
  });
});

describe('adminAuth — slow-hash password (layer 3)', () => {
  const original = process.env.ADMIN_PASSWORD;

  afterEach(() => {
    _resetAdminPasswordMemo();
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

  test('bcrypt verification accepts the configured password, rejects others', async () => {
    process.env.ADMIN_PASSWORD = 'correct-operator-password';
    assert.equal(await verifyAdminPassword('correct-operator-password'), true);
    assert.equal(await verifyAdminPassword('wrong-password'), false);
    assert.equal(await verifyAdminPassword(''), false);
    assert.equal(await verifyAdminPassword(null), false);
    assert.equal(await verifyAdminPassword(42), false);
    assert.equal(await verifyAdminPassword('x'.repeat(201)), false);
  });

  test('password rotation via env change is picked up without restart', async () => {
    process.env.ADMIN_PASSWORD = 'first-password-value';
    assert.equal(await verifyAdminPassword('first-password-value'), true);
    process.env.ADMIN_PASSWORD = 'second-password-value';
    assert.equal(await verifyAdminPassword('first-password-value'), false);
    assert.equal(await verifyAdminPassword('second-password-value'), true);
  });
});

describe('adminAuth — session token (layer 4)', () => {
  test('round-trips: issue then verify', () => {
    const token = issueAdminSessionToken();
    assert.equal(verifyAdminSessionToken(token), true);
  });

  test('token carries the admin purpose segment (domain separation)', () => {
    const token = issueAdminSessionToken();
    assert.ok(token.startsWith('admin-session:v1.'),
      'expected the domain-separation purpose segment first');
  });

  test('a token from a different purpose is rejected (cross-family replay)', () => {
    const token = issueAdminSessionToken();
    const parts = token.split('.');
    const forged = `user-session:v1.${parts[1]}.${parts[2]}.${parts[3]}`;
    assert.equal(verifyAdminSessionToken(forged), false);
  });

  test('rejects a tampered payload (signature mismatch)', () => {
    const token = issueAdminSessionToken();
    const parts = token.split('.');
    const flipped = (parts[1][0] === 'a' ? 'b' : 'a') + parts[1].slice(1);
    assert.equal(verifyAdminSessionToken(`${parts[0]}.${flipped}.${parts[2]}.${parts[3]}`), false);
  });

  test('rejects a token with an edited expiry (replay past TTL)', () => {
    const token = issueAdminSessionToken();
    const parts = token.split('.');
    const future = String(Date.now() + 10 * 86400000);
    assert.equal(verifyAdminSessionToken(`${parts[0]}.${parts[1]}.${future}.${parts[3]}`), false);
  });

  test('rejects a malformed token (wrong segment count / non-string)', () => {
    assert.equal(verifyAdminSessionToken('not-a-token'), false);
    assert.equal(verifyAdminSessionToken('a.b.c'), false);
    assert.equal(verifyAdminSessionToken(null), false);
    assert.equal(verifyAdminSessionToken(42), false);
  });
});

describe('adminAuth — token extraction (layer 5)', () => {
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
