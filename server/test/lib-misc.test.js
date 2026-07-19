// @ts-check
/**
 * Unit tests for three small lib helpers that were zero-tested
 * at audit time:
 *
 *   - src/lib/cookieEnv.js  — shouldUseSharedDomain(req)
 *   - src/lib/multimodal.js — isMultimodalProvider(provider)
 *   - src/lib/log.js        — safeUrl(rawUrl), stripQuery(rawUrl)
 *
 * Each of these has security-relevant behaviour that the audit
 * identified as untested. They are all pure functions of their
 * inputs — no DB / no fetch / no side-effects — so the tests are
 * quick and deterministic.
 *
 * Run with: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldUseSharedDomain,
  SHARED_COOKIE_DOMAIN,
} from '../src/lib/cookieEnv.js';

import { isMultimodalProvider } from '../src/lib/multimodal.js';

import { safeUrl, stripQuery } from '../src/lib/log.js';

/* ── cookieEnv ────────────────────────────────────────────────── */

describe('shouldUseSharedDomain', () => {
  test('returns true for production hosts', () => {
    for (const host of ['app.topodrive.top', 'topodrive.top', 'www.topodrive.top']) {
      assert.equal(shouldUseSharedDomain({ headers: { host } }), true, host);
    }
  });

  test('is case-insensitive on the host header', () => {
    /* Browser sends Host header verbatim; servers behind a CDN
       often see uppercase or mixed-case. The shared-domain decision
       must not break when the casing changes. */
    assert.equal(shouldUseSharedDomain({ headers: { host: 'APP.TOPODRIVE.TOP' } }), true);
  });

  test('strips the port before matching', () => {
    /* Vite dev server and local nginx often serve on
       `localhost:8080` etc. — the shared-domain check must look
       at hostname only, not the port. */
    assert.equal(shouldUseSharedDomain({ headers: { host: 'app.topodrive.top:443' } }), true);
  });

  test('returns false for localhost / 127.0.0.1 / LAN IPs', () => {
    for (const host of ['localhost', '127.0.0.1', 'localhost:3000', '127.0.0.1:5173']) {
      assert.equal(shouldUseSharedDomain({ headers: { host } }), false, host);
    }
  });

  test('returns false for arbitrary / unknown hosts', () => {
    /* Dev environments, staging on a different domain, attacker-
       controlled Host header — anything not in the allow-list
       must NOT receive the shared cookie domain (otherwise the
       browser silently rejects the cookie). */
    for (const host of ['evil.example.com', 'topodrive.top.evil.com', 'app.topodrive.top.evil.com']) {
      assert.equal(shouldUseSharedDomain({ headers: { host } }), false, host);
    }
  });

  test('returns false when the host header is missing', () => {
    assert.equal(shouldUseSharedDomain({ headers: {} }), false);
    assert.equal(shouldUseSharedDomain({}), false);
    assert.equal(shouldUseSharedDomain(undefined), false);
  });

  test('SHARED_COOKIE_DOMAIN constant is the documented value', () => {
    /* Operators rely on this for clearCookie() symmetry — changing
       the constant is a breaking change and must be a deliberate
       decision. */
    assert.equal(SHARED_COOKIE_DOMAIN, '.topodrive.top');
  });
});

/* ── multimodal ──────────────────────────────────────────────── */

describe('isMultimodalProvider', () => {
  test('returns true when isMultimodal === true', () => {
    assert.equal(isMultimodalProvider({ isMultimodal: true }), true);
  });

  test('returns false when isMultimodal is false / missing / wrong type', () => {
    assert.equal(isMultimodalProvider({ isMultimodal: false }), false);
    assert.equal(isMultimodalProvider({}), false);
    assert.equal(isMultimodalProvider({ isMultimodal: 'yes' }), false,
      'truthy non-boolean strings must NOT count as true');
    assert.equal(isMultimodalProvider({ isMultimodal: 1 }), false,
      'numeric 1 must NOT count as true');
  });

  test('returns false for null / undefined / non-object inputs', () => {
    assert.equal(isMultimodalProvider(null), false);
    assert.equal(isMultimodalProvider(undefined), false);
    assert.equal(isMultimodalProvider(''), false);
    assert.equal(isMultimodalProvider(42), false);
    assert.equal(isMultimodalProvider([]), false);
  });
});

/* ── log.js: safeUrl / stripQuery ─────────────────────────────── */

describe('safeUrl', () => {
  test('returns empty string for non-string / empty input', () => {
    assert.equal(safeUrl(''), '');
    assert.equal(safeUrl(null), '');
    assert.equal(safeUrl(undefined), '');
    assert.equal(safeUrl(42), '');
  });

  test('returns the URL verbatim when there is no query string', () => {
    assert.equal(safeUrl('/api/users/me'), '/api/users/me');
    assert.equal(safeUrl('https://example.com/foo'), 'https://example.com/foo');
  });

  test('redacts every SENSITIVE_PARAM value with [REDACTED]', () => {
    /* Covers the canonical token-bearing query params. */
    const cases = [
      ['?token=abc', '[REDACTED]'],
      ['?access_token=abc', '[REDACTED]'],
      ['?id_token=abc', '[REDACTED]'],
      ['?refresh_token=abc', '[REDACTED]'],
      ['?code=abc', '[REDACTED]'],
      ['?state=abc', '[REDACTED]'],
      ['?sid=abc', '[REDACTED]'],
      ['?reset_token=abc', '[REDACTED]'],
      ['?verify_token=abc', '[REDACTED]'],
      ['?share_token=abc', '[REDACTED]'],
      ['?api_key=sk-xxx', '[REDACTED]'],
      ['?apikey=sk-xxx', '[REDACTED]'],
      ['?csrf=abc', '[REDACTED]'],
    ];
    for (const [qs, marker] of cases) {
      const out = safeUrl('/api/x' + qs);
      assert.match(out, new RegExp(marker), `should redact ${qs}`);
      assert.equal(out.includes('abc'), false, `${qs} value leaked`);
      assert.equal(out.includes('sk-xxx'), false, `${qs} api-key leaked`);
    }
  });

  test('matches sensitive param keys case-insensitively', () => {
    const out = safeUrl('/api/x?TOKEN=secret&Code=oauth');
    assert.equal(out.includes('secret'), false);
    assert.equal(out.includes('oauth'), false);
    assert.match(out, /TOKEN=\[REDACTED\]/);
  });

  test('URL-decodes the key when checking the allow-list (defence)', () => {
    /* %74oken decodes to "token" — the SENSITIVE_PARAMS lookup
       runs against the decoded key, so the value MUST be redacted
       even when the key is URL-encoded. The output preserves the
       raw key form (not re-encoded), so we just assert the value
       is redacted. */
    const out = safeUrl('/api/x?%74oken=secret');
    assert.equal(out.includes('secret'), false);
    assert.match(out, /=\[REDACTED\]/);
  });

  test('redacts non-sensitive param VALUES too (only the key is preserved)', () => {
    /* Even innocuous-looking params (foo=bar) have their VALUES
       replaced with [RED] so a free-form user prompt / search
       query can't land verbatim in operator logs. */
    const out = safeUrl('/api/x?q=hello+world&page=2');
    assert.match(out, /q=\[RED\]/);
    assert.match(out, /page=\[RED\]/);
    assert.equal(out.includes('hello'), false);
    assert.equal(out.includes('world'), false);
  });

  test('preserves the path and the relative param order', () => {
    const out = safeUrl('/api/foo?token=secret&page=2&limit=10');
    assert.match(out, /^\/api\/foo\?/);
    assert.match(out, /token=\[REDACTED\]/);
    assert.match(out, /page=\[RED\]/);
    assert.match(out, /limit=\[RED\]/);
  });

  test('handles a key with no value (/?foo)', () => {
    const out = safeUrl('/api/x?flag');
    /* No `=`, value is empty string; output should still mark it. */
    assert.match(out, /flag/);
  });

  test('handles URL-encoded values in keys without throwing', () => {
    /* Malformed encoding should be tolerated. */
    const out = safeUrl('/api/x?%ZZ=value');
    assert.match(out, /^.+%/);
  });
});

describe('stripQuery', () => {
  test('returns the path when there is a query string', () => {
    assert.equal(stripQuery('/api/x?token=secret&foo=bar'), '/api/x');
    assert.equal(stripQuery('https://example.com/foo?a=1'), 'https://example.com/foo');
  });

  test('returns the URL verbatim when there is no query string', () => {
    assert.equal(stripQuery('/api/x'), '/api/x');
    assert.equal(stripQuery(''), '');
  });

  test('returns empty string for non-string input', () => {
    assert.equal(stripQuery(null), '');
    assert.equal(stripQuery(undefined), '');
    assert.equal(stripQuery(42), '');
  });
});