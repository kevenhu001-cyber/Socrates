// @ts-check
/**
 * Contract-level tests for the token grammars accepted by the mobile API.
 * These do not need a database, so they remain a reliable regression gate
 * even in local/CI environments without DATABASE_URL.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'node:fs';

import {
  buildMobileTokenPair,
  isEmbeddedMobileTarget,
  isMobileAccessToken,
  isMobileRefreshToken,
  mobileTokenPairId,
} from '../src/services/auth.js';
import authRouter, { MOBILE_AUTH_ROUTE_PATHS, redirectMobileWebSession } from '../src/routes/auth.js';
import { requestCredential, requireMobileBearer } from '../src/middleware/auth.js';
import { listen, httpRequest } from './_http.js';

function request({ authorization, sid } = {}) {
  return {
    headers: authorization === undefined ? {} : { authorization },
    cookies: sid === undefined ? {} : { sid },
  };
}

function protectedMobileApp() {
  const app = express();
  app.use(cookieParser());
  app.post('/mobile-only', requireMobileBearer, (_req, res) => res.json({ ok: true }));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ code: err.code }));
  return app;
}

function routeMiddleware(path) {
  const route = authRouter.stack.find((layer) => layer.route?.path === path);
  assert.ok(route, `${path} route must remain registered`);
  return route.route.stack.map((layer) => layer.handle);
}

describe('mobile auth token contract', () => {
  test('creates distinct access and refresh tokens with one pair id and expected expiry ordering', () => {
    const now = Date.UTC(2026, 0, 1);
    const tokens = buildMobileTokenPair(now);
    assert.match(tokens.accessToken, /^ma\.[a-f0-9]{32}\.[a-f0-9]{64}$/);
    assert.match(tokens.refreshToken, /^mr\.[a-f0-9]{32}\.[a-f0-9]{64}$/);
    assert.notEqual(tokens.accessToken, tokens.refreshToken);
    assert.equal(isMobileAccessToken(tokens.accessToken), true);
    assert.equal(isMobileRefreshToken(tokens.accessToken), false);
    assert.equal(isMobileRefreshToken(tokens.refreshToken), true);
    assert.equal(mobileTokenPairId(tokens.accessToken), mobileTokenPairId(tokens.refreshToken));
    assert.ok(Date.parse(tokens.expiresAt) > now);
    assert.ok(Date.parse(tokens.refreshExpiresAt) > Date.parse(tokens.expiresAt));
  });

  test('openapi MobileBearerPair matches the real token shape (no expiresIn drift)', () => {
    /* Regression: the spec documented {accessToken, refreshToken,
     * expiresIn:int} while the server returns {…, expiresAt:ISO,
     * refreshExpiresAt:ISO} — every client generated from the spec
     * parsed the pair wrong. Fail here if they drift again. */
    const spec = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'));
    const schema = spec.components.schemas.MobileBearerPair;
    assert.deepEqual([...schema.required].sort(), ['accessToken', 'expiresAt', 'refreshExpiresAt', 'refreshToken']);
    const pair = buildMobileTokenPair();
    for (const key of schema.required) {
      assert.equal(typeof pair[key], 'string', `${key} must be present on the built pair`);
    }
  });

  test('does not accept refresh, capability, malformed, or browser values as bearer access tokens', () => {
    const tokens = buildMobileTokenPair();
    assert.equal(isMobileAccessToken(tokens.refreshToken), false);
    assert.equal(isMobileAccessToken('mw.projects.' + 'a'.repeat(64)), false);
    assert.equal(isMobileAccessToken('mo.' + 'a'.repeat(64)), false);
    assert.equal(isMobileAccessToken('a'.repeat(64)), false);
    assert.equal(isMobileAccessToken('Bearer ' + tokens.accessToken), false);
  });

  test('uses a valid mobile bearer ahead of a stale browser cookie', () => {
    const tokens = buildMobileTokenPair();
    assert.deepEqual(requestCredential(request({ authorization: `Bearer ${tokens.accessToken}`, sid: 'a'.repeat(64) })), {
      token: tokens.accessToken,
      source: 'bearer',
    });
  });

  test('does not fall back to a cookie when an Authorization header is malformed or a refresh token', () => {    const tokens = buildMobileTokenPair();
    assert.equal(requestCredential(request({ authorization: `Bearer ${tokens.refreshToken}`, sid: 'a'.repeat(64) })), null);
    assert.equal(requestCredential(request({ authorization: 'Basic abc', sid: 'a'.repeat(64) })), null);
    assert.equal(requestCredential(request({ authorization: `Bearer ${tokens.accessToken} trailing`, sid: 'a'.repeat(64) })), null);
  });

  test('still accepts only the legacy 64-hex browser sid from a cookie', () => {
    assert.deepEqual(requestCredential(request({ sid: 'a'.repeat(64) })), { token: 'a'.repeat(64), source: 'cookie' });
    assert.equal(requestCredential(request({ sid: 'not-a-session' })), null);
  });

  test('keeps the mobile WebView target allowlist exact', () => {
    for (const target of ['projects', 'scheduled', 'plugins', 'knowledge', 'mistakes', 'skills', 'api-settings']) {
      assert.equal(isEmbeddedMobileTarget(target), true, target);
    }
    for (const target of ['', 'project', 'settings', 'https://evil.example/', '../../projects', null, {}]) {
      assert.equal(isEmbeddedMobileTarget(target), false, String(target));
    }
  });

  test('keeps every React Native auth endpoint mounted in the public contract', () => {
    assert.deepEqual([...MOBILE_AUTH_ROUTE_PATHS], [
      '/mobile/login',
      '/mobile/refresh',
      '/mobile/login-with-code',
      '/mobile/verify',
      '/mobile/logout',
      '/mobile/web-session',
      '/mobile/web-session/consume',
      '/mobile/oauth/exchange',
    ]);
  });

  test('keeps the WebView-session issuer Bearer-only', () => {
    const middleware = routeMiddleware('/mobile/web-session');
    assert.ok(middleware.includes(requireMobileBearer));
    assert.equal(middleware.some((handler) => handler.name === 'requireAuth'), false);
  });

  test('marks the one-time WebView redirect response as non-cacheable', async () => {
    const headers = {};
    let redirectedTo;
    const res = {
      clearCookie() {},
      cookie() {},
      set(name, value) { headers[name] = value; return this; },
      redirect(_status, location) { redirectedTo = location; return this; },
    };
    redirectMobileWebSession(
      { protocol: 'https', get: () => 'app.topodrive.top', headers: { host: 'app.topodrive.top' } },
      res,
      'a'.repeat(64),
      'projects',
    );
    assert.equal(headers['Cache-Control'], 'no-store');
    assert.equal(headers['Referrer-Policy'], 'no-referrer');
    assert.equal(redirectedTo, '/?mobile_target=projects');
  });
});

describe('mobile bearer route guard', () => {
  test('rejects a cookie-only request before it can mint a WebView capability', async () => {
    const server = await listen(protectedMobileApp());
    try {
      const response = await httpRequest(server.url + '/mobile-only', {
        method: 'POST',
        cookies: { sid: 'a'.repeat(64) },
        body: {},
      });
      assert.equal(response.status, 401);
    } finally {
      await server.close();
    }
  });
});
