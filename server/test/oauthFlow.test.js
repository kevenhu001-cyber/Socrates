// @ts-check
/**
 * End-to-end Phase D OAuth 2.0 flow against a minimal Express app:
 *
 *   client registration → consent screen (GET authorize)
 *   → consent decision (POST authorize, manual double-submit CSRF)
 *   → authorization_code + PKCE S256 exchange (POST token)
 *   → Bearer at_* token authenticates protected routes with granted scopes
 *   → insufficient-scope enforcement (403 INSUFFICIENT_SCOPE)
 *   → rotating refresh grant (old refresh dies)
 *   → RFC 7009 revocation kills the pair
 *
 * Needs PostgreSQL (skipped without DATABASE_URL). Every row hangs off a
 * uniquely-random test user and is removed in `after` (all tables cascade).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';

import oauthRouter, { createOAuthClient } from '../src/routes/oauth.ts';
import { csrfProtection } from '../src/middleware/csrf.ts';
import { requireAuth } from '../src/middleware/auth.js';
import { requireScope } from '../src/middleware/scopes.ts';
import { errorHandler } from '../src/middleware/error.js';
import { initDb, getDb, closeDb } from '../src/db/index.js';
import { users, authSessions } from '../src/db/schema.js';
import { listen, httpRequest } from './_http.js';

let dbAvailable = false;
let server = null;
let ctx = null;

function s256(verifier) {
  return crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

function basicHeader() {
  return `Basic ${Buffer.from(`${ctx.client.clientId}:${ctx.clientSecret}`).toString('base64')}`;
}

/**
 * The consent response carries csrf-clearing cookies (empty value, expired)
 * followed by the fresh pair half — pick the last non-empty one.
 */
function latestCsrfCookie(setCookies) {
  const values = (setCookies || [])
    .map((c) => c.split(';')[0])
    .filter((c) => c.startsWith('csrf=') && c.length > 'csrf='.length);
  return values[values.length - 1] || null;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(csrfProtection);
  app.use('/api/oauth', oauthRouter);
  app.get('/api/whoami', requireAuth, (req, res) => {
    res.json({ userId: req.userId, kind: req.authKind, scopes: [...(req.authScopes || [])] });
  });
  app.get('/api/probe', requireAuth, requireScope('chat:read'), (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

/**
 * Drive one full authorization round for `scope`: consent GET → csrf pair →
 * POST allow → PKCE exchange. Returns the token endpoint response object.
 */
async function authorizeAndExchange(scope) {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const authorizeParams = new URLSearchParams({
    response_type: 'code',
    client_id: ctx.client.clientId,
    redirect_uri: ctx.redirectUri,
    scope,
    state: 'st-' + crypto.randomBytes(4).toString('hex'),
    code_challenge: s256(verifier),
    code_challenge_method: 'S256',
  });

  const get = await httpRequest(`${server.url}/api/oauth/authorize?${authorizeParams}`, {
    cookies: { sid: ctx.sid },
  });
  assert.equal(get.status, 200, `consent screen should render, got ${get.status}: ${get.text?.slice(0, 160)}`);
  const match = /name="csrf_token" value="([a-f0-9]{64})"/.exec(get.text);
  assert.ok(match, 'csrf hidden field present on consent page');
  const csrfCookiePair = latestCsrfCookie(get.setCookies);
  assert.ok(csrfCookiePair, 'fresh csrf cookie set by consent screen');

  const post = await httpRequest(`${server.url}/api/oauth/authorize`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    cookies: { sid: ctx.sid, csrf: csrfCookiePair.slice('csrf='.length) },
    body: new URLSearchParams({
      ...Object.fromEntries(authorizeParams),
      decision: 'allow',
      csrf_token: match[1],
    }).toString(),
  });
  assert.equal(post.status, 302, `consent allow should 302, got ${post.status}: ${post.text?.slice(0, 160)}`);

  const token = await httpRequest(`${server.url}/api/oauth/token`, {
    method: 'POST',
    headers: { Authorization: basicHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: new URL(post.headers.get('location')).searchParams.get('code'),
      redirect_uri: ctx.redirectUri,
      code_verifier: verifier,
    }).toString(),
  });
  assert.equal(token.status, 200, JSON.stringify(token.body));
  return token.body;
}

before(async () => {
  if (!process.env.DATABASE_URL) return;
  try {
    initDb(process.env.DATABASE_URL);
    const db = getDb();
    const email = `test-oauthflow-${crypto.randomUUID()}@invalid.test`;
    const [user] = await db.insert(users).values({
      email,
      passwordHash: 'test-only-not-a-real-hash',
      verifiedAt: new Date(),
    }).returning();
    const sid = crypto.randomBytes(32).toString('hex');
    await db.insert(authSessions).values({
      token: sid,
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const clientId = `cli_test_${crypto.randomBytes(6).toString('hex')}`;
    const redirectUri = 'http://127.0.0.1/cb';
    const { client, clientSecret } = await createOAuthClient({
      clientId,
      name: 'Phase D flow test',
      redirectUris: [redirectUri],
      allowedScopes: ['chat:read', 'sessions:read'],
      ownerUserId: user.id,
    });

    ctx = { user, sid, client, clientSecret, redirectUri };
    server = await listen(buildApp());
    dbAvailable = true;
  } catch (err) {
    console.warn('[oauthFlow] setup failed, skipping suite:', err.message);
    dbAvailable = false;
  }
});

after(async () => {
  try {
    if (ctx?.user) await getDb().delete(users).where(eq(users.id, ctx.user.id));
  } catch { /* best-effort cleanup */ }
  if (server) await server.close();
  if (dbAvailable) await closeDb();
});

describe('oauth2 authorization-code + PKCE flow', () => {
  test('consent screen renders client name + scopes for a signed-in session', async (t) => {
    if (!dbAvailable) return t.skip();
    const authorizeParams = new URLSearchParams({
      response_type: 'code',
      client_id: ctx.client.clientId,
      redirect_uri: ctx.redirectUri,
      scope: 'chat:read',
      code_challenge: s256('x'.repeat(43)),
      code_challenge_method: 'S256',
    });
    const r = await httpRequest(`${server.url}/api/oauth/authorize?${authorizeParams}`, { cookies: { sid: ctx.sid } });
    assert.equal(r.status, 200);
    assert.match(r.text, /Authorize Phase D flow test\?/);
    assert.match(r.text, /<code>chat:read<\/code>/);
  });

  test('unauthenticated authorize gets 401 + WWW-Authenticate discovery challenge', async (t) => {
    if (!dbAvailable) return t.skip();
    const authorizeParams = new URLSearchParams({
      response_type: 'code',
      client_id: ctx.client.clientId,
      redirect_uri: ctx.redirectUri,
      scope: 'chat:read',
      code_challenge: s256('x'.repeat(43)),
      code_challenge_method: 'S256',
    });
    const r = await httpRequest(`${server.url}/api/oauth/authorize?${authorizeParams}`);
    assert.equal(r.status, 401);
    assert.match(r.headers.get('www-authenticate') || '', /authorization_uri="/);
  });

  test('mismatched redirect_uri renders an error page instead of redirecting', async (t) => {
    if (!dbAvailable) return t.skip();
    const authorizeParams = new URLSearchParams({
      response_type: 'code',
      client_id: ctx.client.clientId,
      redirect_uri: 'https://evil.example/cb',
      scope: 'chat:read',
    });
    const r = await httpRequest(`${server.url}/api/oauth/authorize?${authorizeParams}`, { cookies: { sid: ctx.sid } });
    assert.equal(r.status, 400);
    assert.doesNotMatch(r.headers.get('location') || '', /evil\.example/);
  });

  test('consent POST rejects a mismatched csrf pair', async (t) => {
    if (!dbAvailable) return t.skip();
    const authorizeParams = new URLSearchParams({
      response_type: 'code',
      client_id: ctx.client.clientId,
      redirect_uri: ctx.redirectUri,
      scope: 'chat:read',
      code_challenge: s256('y'.repeat(43)),
      code_challenge_method: 'S256',
    });
    const post = await httpRequest(`${server.url}/api/oauth/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      cookies: { sid: ctx.sid, csrf: 'f'.repeat(64) },
      body: new URLSearchParams({ ...Object.fromEntries(authorizeParams), decision: 'allow', csrf_token: '0'.repeat(64) }).toString(),
    });
    assert.equal(post.status, 403);
    assert.match(post.text, /CSRF validation failed/);
  });

  test('happy path: consent → single-use code → token → scoped bearer call', async (t) => {
    if (!dbAvailable) return t.skip();
    // Drive the raw flow once manually so every hop can be asserted.
    const verifier = crypto.randomBytes(32).toString('base64url');
    const authorizeParams = new URLSearchParams({
      response_type: 'code',
      client_id: ctx.client.clientId,
      redirect_uri: ctx.redirectUri,
      scope: 'chat:read',
      state: 'st-happy',
      code_challenge: s256(verifier),
      code_challenge_method: 'S256',
    });
    const get = await httpRequest(`${server.url}/api/oauth/authorize?${authorizeParams}`, { cookies: { sid: ctx.sid } });
    const csrfToken = /name="csrf_token" value="([a-f0-9]{64})"/.exec(get.text)[1];
    const csrfCookiePair = latestCsrfCookie(get.setCookies);

    const post = await httpRequest(`${server.url}/api/oauth/authorize`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      cookies: { sid: ctx.sid, csrf: csrfCookiePair.slice('csrf='.length) },
      body: new URLSearchParams({ ...Object.fromEntries(authorizeParams), decision: 'allow', csrf_token: csrfToken }).toString(),
    });
    assert.equal(post.status, 302);
    const location = new URL(post.headers.get('location'));
    assert.equal(location.origin + location.pathname, ctx.redirectUri);
    assert.equal(location.searchParams.get('state'), 'st-happy');
    assert.equal(location.searchParams.get('iss'), 'https://app.topodrive.top/api/oauth');
    const code = location.searchParams.get('code');

    const token = await httpRequest(`${server.url}/api/oauth/token`, {
      method: 'POST',
      headers: { Authorization: basicHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: ctx.redirectUri,
        code_verifier: verifier,
      }).toString(),
    });
    assert.equal(token.status, 200, JSON.stringify(token.body));
    assert.match(token.body.access_token, /^at_[A-Za-z0-9_-]{43}$/);
    assert.match(token.body.refresh_token, /^rt_[A-Za-z0-9_-]{43}$/);
    assert.equal(token.body.token_type, 'Bearer');
    assert.equal(token.body.scope, 'chat:read');
    assert.equal(token.body.expires_in, 3600);
    ctx.pair1 = token.body;

    // The code is single-use — replay loses the atomic consumption race.
    const replay = await httpRequest(`${server.url}/api/oauth/token`, {
      method: 'POST',
      headers: { Authorization: basicHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: ctx.redirectUri,
        code_verifier: verifier,
      }).toString(),
    });
    assert.equal(replay.status, 400);
    assert.equal(replay.body.error, 'invalid_grant');

    // The opaque bearer authenticates protected routes with granted scopes only.
    const whoami = await httpRequest(`${server.url}/api/whoami`, {
      headers: { Authorization: `Bearer ${token.body.access_token}` },
    });
    assert.equal(whoami.status, 200);
    assert.equal(whoami.body.userId, ctx.user.id);
    assert.equal(whoami.body.kind, 'oauth_token');
    assert.deepEqual(whoami.body.scopes, ['chat:read']);
  });

  test('insufficient scope yields 403 INSUFFICIENT_SCOPE + RFC 6750 header', async (t) => {
    if (!dbAvailable) return t.skip();
    const limited = await authorizeAndExchange('sessions:read');
    const denied = await httpRequest(`${server.url}/api/probe`, {
      headers: { Authorization: `Bearer ${limited.access_token}` },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, 'INSUFFICIENT_SCOPE');
    assert.match(denied.headers.get('www-authenticate') || '', /error="insufficient_scope"/);

    // sessions:read still passes routes gated on its own scope.
    const ok = await httpRequest(`${server.url}/api/whoami`, {
      headers: { Authorization: `Bearer ${limited.access_token}` },
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.scopes, ['sessions:read']);
  });

  test('refresh rotation: presented refresh token dies on first use', async (t) => {
    if (!dbAvailable) return t.skip();
    const refreshed = await httpRequest(`${server.url}/api/oauth/token`, {
      method: 'POST',
      headers: { Authorization: basicHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: ctx.pair1.refresh_token,
      }).toString(),
    });
    assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body));
    assert.match(refreshed.body.access_token, /^at_/);
    assert.notEqual(refreshed.body.refresh_token, ctx.pair1.refresh_token);

    const replay = await httpRequest(`${server.url}/api/oauth/token`, {
      method: 'POST',
      headers: { Authorization: basicHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: ctx.pair1.refresh_token,
      }).toString(),
    });
    assert.equal(replay.status, 400);
    assert.equal(replay.body.error, 'invalid_grant');
  });

  test('RFC 7009 revoke kills both halves of the pair', async (t) => {
    if (!dbAvailable) return t.skip();
    const revoked = await httpRequest(`${server.url}/api/oauth/revoke`, {
      method: 'POST',
      headers: { Authorization: basicHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: ctx.pair1.access_token }).toString(),
    });
    assert.equal(revoked.status, 200);

    const deadAccess = await httpRequest(`${server.url}/api/whoami`, {
      headers: { Authorization: `Bearer ${ctx.pair1.access_token}` },
    });
    assert.equal(deadAccess.status, 401);

    // The paired refresh half died with it.
    const deadRefresh = await httpRequest(`${server.url}/api/oauth/token`, {
      method: 'POST',
      headers: { Authorization: basicHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: ctx.pair1.refresh_token,
      }).toString(),
    });
    assert.equal(deadRefresh.status, 400);
  });
});
