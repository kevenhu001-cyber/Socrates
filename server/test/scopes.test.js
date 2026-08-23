// @ts-check
/**
 * Unit tests for src/middleware/scopes.ts — the closed scope vocabulary and
 * the requireScope / resourceScope gates that constrain agent-key callers.
 * Pure middleware logic; no database required.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_SCOPES,
  ALL_SCOPES_SET,
  parseScopes,
  parseScopeParam,
  requireScope,
  resourceScope,
} from '../src/middleware/scopes.ts';
import { AGENT_KEY_RE } from '../src/services/agentKeys.ts';
import { Forbidden, Unauthorized } from '../src/lib/errors.js';

function fakeRes() {
  const headers = {};
  return {
    headers,
    set(name, value) { headers[name] = value; return this; },
  };
}

function run(mw, req) {
  return new Promise((resolve) => {
    const res = fakeRes();
    const next = (err) => resolve({ err, res });
    Promise.resolve(mw(req, res, next)).catch((e) => resolve({ err: e, res }));
  });
}

describe('scope vocabulary', () => {
  test('exposes exactly ten resource scopes', () => {
    assert.equal(ALL_SCOPES.length, 10);
    for (const s of ALL_SCOPES) assert.match(s, /^(chat|memory|sessions|files|projects):(read|write)$/);
  });

  test('parseScopes accepts valid lists and deduplicates', () => {
    assert.deepEqual(parseScopes(['chat:read', 'chat:read', 'files:write']), ['chat:read', 'files:write']);
  });

  test('parseScopes rejects unknown, non-string, and non-array input', () => {
    assert.equal(parseScopes(['chat:read', 'admin:everything']), null);
    assert.equal(parseScopes([42]), null);
    assert.equal(parseScopes('chat:read'), null);
  });

  test('parseScopeParam splits space-separated OAuth scope params', () => {
    assert.deepEqual(parseScopeParam('chat:read   memory:write'), ['chat:read', 'memory:write']);
    // Missing/empty scope params resolve to an empty grant list — callers
    // treat length 0 exactly like null (invalid_scope).
    assert.deepEqual(parseScopeParam(''), []);
    assert.deepEqual(parseScopeParam(undefined), []);
    assert.equal(parseScopeParam('chat:read bogus'), null);
  });
});

describe('requireScope', () => {
  test('401 with RFC 6750 challenge when no auth context resolved', async () => {
    const out = await run(requireScope('chat:read'), {});
    assert.ok(out.err instanceof Unauthorized);
    assert.equal(out.err.status, 401);
    assert.match(out.res.headers['WWW-Authenticate'], /error="invalid_token"/);
  });

  test('403 INSUFFICIENT_SCOPE with insufficient_scope challenge on missing scope', async () => {
    const out = await run(requireScope('chat:read', 'memory:read'), { authScopes: new Set(['chat:read']) });
    assert.ok(out.err instanceof Forbidden);
    assert.equal(out.err.code, 'INSUFFICIENT_SCOPE');
    assert.match(out.res.headers['WWW-Authenticate'], /error="insufficient_scope"/);
    assert.match(out.res.headers['WWW-Authenticate'], /scope="memory:read"/);
  });

  test('proceeds when every required scope is granted', async () => {
    const out = await run(requireScope('chat:read', 'memory:read'), { authScopes: new Set(ALL_SCOPES_SET) });
    assert.equal(out.err, undefined);
  });
});

describe('resourceScope', () => {
  test('safe methods demand <resource>:read', async () => {
    const out = await run(resourceScope('sessions'), { method: 'GET', authScopes: new Set(['sessions:read']) });
    assert.equal(out.err, undefined);
    const denied = await run(resourceScope('sessions'), { method: 'GET', authScopes: new Set(['sessions:write']) });
    assert.equal(denied.err.code, 'INSUFFICIENT_SCOPE');
  });

  test('mutating methods demand <resource>:write', async () => {
    const ok = await run(resourceScope('chat'), { method: 'POST', authScopes: new Set(['chat:write']) });
    assert.equal(ok.err, undefined);
    const denied = await run(resourceScope('chat'), { method: 'POST', authScopes: new Set(['chat:read']) });
    assert.equal(denied.err.code, 'INSUFFICIENT_SCOPE');
  });
});

describe('agent key grammar', () => {
  test('AGENT_KEY_RE accepts ak_<20 base32>.<43 base64url> and rejects mobile tokens', () => {
    const good = `Bearer ak_abcdefghijklmnopqrst.${'A'.repeat(43)}`;
    assert.equal(AGENT_KEY_RE.test(good), true);
    // mobile access token grammar must NOT match
    assert.equal(AGENT_KEY_RE.test(`Bearer ma.abcdef0123456789abcdef0123456789.${'a'.repeat(64)}`), false);
    assert.equal(AGENT_KEY_RE.test('Bearer ak_short.tiny'), false);
  });
});
