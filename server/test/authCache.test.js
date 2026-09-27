import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authCacheGet,
  authCacheSet,
  invalidateAuthCache,
  invalidateAuthCacheForUser,
  isOneTimeAuthToken,
  _resetAuthCache,
  AUTH_CACHE_TTL_MS,
  AUTH_CACHE_MAX_ENTRIES,
} from '../src/lib/authCache.js';

/* lib/authCache.ts backs an authentication decision, so its contract is a
   security contract. The cases below are the ones that would let a revoked or
   spent credential keep working. */

const T0 = 1_700_000_000_000;

function user(id) {
  return { id, email: `${id}@example.com` };
}

test('a cached session is served before its TTL and dropped after', () => {
  _resetAuthCache();
  const token = 'a'.repeat(64);
  const expires = new Date(T0 + 10 * 60_000);
  authCacheSet(token, user('u1'), expires, T0);

  assert.equal(authCacheGet(token, T0 + 1_000)?.id, 'u1');
  /* T0 + TTL is the boundary; the entry must be gone at or past it. */
  assert.equal(authCacheGet(token, T0 + AUTH_CACHE_TTL_MS), null);
});

test('an entry never outlives the credential it was resolved from', () => {
  _resetAuthCache();
  const token = 'b'.repeat(64);
  /* Session expires in 5s, well inside the TTL. */
  const expires = new Date(T0 + 5_000);
  authCacheSet(token, user('u1'), expires, T0);

  assert.equal(authCacheGet(token, T0 + 4_999)?.id, 'u1');
  assert.equal(
    authCacheGet(token, T0 + 5_000),
    null,
    'a revoked-by-expiry session must stop authenticating exactly when it expires',
  );
});

test('an already-expired session is never cached at all', () => {
  _resetAuthCache();
  const token = 'c'.repeat(64);
  authCacheSet(token, user('u1'), new Date(T0 - 1), T0);
  assert.equal(authCacheGet(token, T0), null);
});

test('one-time capabilities are never cached', () => {
  _resetAuthCache();
  /* mw.* is a WebView hand-off and mo.* an OAuth exchange — both are DELETEd
     by the exchange that reads them, so a cached resolution would let a spent
     capability authenticate a second time. */
  for (const token of ['mw.target.' + 'd'.repeat(64), 'mo.' + 'e'.repeat(64)]) {
    assert.equal(isOneTimeAuthToken(token), true, token);
    authCacheSet(token, user('u1'), new Date(T0 + 3_600_000), T0);
    assert.equal(authCacheGet(token, T0), null, token + ' must read through to the DB');
  }
  assert.equal(isOneTimeAuthToken('a'.repeat(64)), false);
  assert.equal(isOneTimeAuthToken('ma.pair.secret'), false);
});

test('logout drops exactly the revoked token', () => {
  _resetAuthCache();
  const revoked = 'd'.repeat(64);
  const other = 'e'.repeat(64);
  const expires = new Date(T0 + 3_600_000);
  authCacheSet(revoked, user('u1'), expires, T0);
  authCacheSet(other, user('u2'), expires, T0);

  invalidateAuthCache(revoked);
  assert.equal(authCacheGet(revoked, T0), null);
  assert.equal(authCacheGet(other, T0)?.id, 'u2', 'a different device stays signed in');
});

test('a bare invalidate clears every entry (the no-token-known path)', () => {
  _resetAuthCache();
  const expires = new Date(T0 + 3_600_000);
  authCacheSet('f'.repeat(64), user('u1'), expires, T0);
  authCacheSet('1'.repeat(64), user('u2'), expires, T0);

  invalidateAuthCache();
  assert.equal(authCacheGet('f'.repeat(64), T0), null);
  assert.equal(authCacheGet('1'.repeat(64), T0), null);
});

test('revoke-all-sessions drops every device for that user only', () => {
  _resetAuthCache();
  const expires = new Date(T0 + 3_600_000);
  authCacheSet('a'.repeat(64), user('u1'), expires, T0);
  authCacheSet('b'.repeat(64), user('u1'), expires, T0);
  authCacheSet('c'.repeat(64), user('u2'), expires, T0);

  invalidateAuthCacheForUser('u1');
  assert.equal(authCacheGet('a'.repeat(64), T0), null);
  assert.equal(authCacheGet('b'.repeat(64), T0), null);
  assert.equal(
    authCacheGet('c'.repeat(64), T0)?.id,
    'u2',
    'a password change must not sign every other user out',
  );
});

test('invalidateAuthCacheForUser tolerates a missing user', () => {
  _resetAuthCache();
  invalidateAuthCacheForUser(null);
  invalidateAuthCacheForUser(undefined);
  invalidateAuthCacheForUser('');
});

test('the cache stays bounded', () => {
  _resetAuthCache();
  const expires = new Date(T0 + 3_600_000);
  for (let i = 0; i < AUTH_CACHE_MAX_ENTRIES + 25; i += 1) {
    authCacheSet('tok' + i, user('u' + i), expires, T0);
  }
  /* The newest entry must still be present — i.e. the bound evicted the
     oldest, not the most recent. */
  assert.equal(
    authCacheGet('tok' + (AUTH_CACHE_MAX_ENTRIES + 24), T0)?.id,
    'u' + (AUTH_CACHE_MAX_ENTRIES + 24),
  );
  _resetAuthCache();
});
