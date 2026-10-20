import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { appRouteFixture } from './_appRouteFixture.js';
import { authSessions } from '../src/db/schema/index.js';

const f = appRouteFixture();
const state = 'a'.repeat(64);
const verifier = 'v'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
let client = 0;

// The sandbox fetch implementation rewrites Host to the target URL. Native
// node:http keeps the production Host while connecting only to the local fixture.
function request(path, { browser = true, headers = {}, body, ip } = {}) {
  const url = new URL(path, f.url);
  const payload = JSON.stringify(body ?? {});
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: {
        Host: 'app.topodrive.top', 'X-Forwarded-Proto': 'https',
        'X-Forwarded-For': ip || `198.51.100.${++client}`,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload),
        ...(browser ? { Origin: 'https://app.topodrive.top', Cookie: `sid=${f.owner.sid}; csrf=${f.owner.csrf}`, 'X-CSRF-Token': f.owner.csrf } : {}),
        ...headers,
      },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (part) => { text += part; });
      res.on('end', () => resolve({ status: res.statusCode, headers: new Headers(res.headers), body: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}
function privacy(response) {
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
}
async function issue(prefix = '/api/v2') {
  const response = await request(`${prefix}/auth/mobile/browser/authorize`, {
    body: { state, codeChallenge: challenge, redirectUri: 'https://attacker.invalid/' },
  });
  assert.equal(response.status, 200);
  privacy(response);
  const callback = new URL(response.body.url);
  assert.equal(callback.origin, 'https://app.topodrive.top');
  assert.equal(callback.pathname, '/auth/android/callback');
  assert.equal(callback.search, '');
  const params = new URLSearchParams(callback.hash.slice(1));
  assert.equal(params.get('state'), state);
  const code = params.get('code');
  assert.match(code, /^[a-f0-9]{64}$/);
  assert.ok(Date.parse(response.body.expiresAt) > Date.now());
  assert.ok(Date.parse(response.body.expiresAt) <= Date.now() + 300000);
  return code;
}
function exchange(code, codeVerifier = verifier, extra = {}) {
  return request('/api/v2/auth/mobile/browser/exchange', { browser: false, body: { code, codeVerifier }, ...extra });
}

test('authorize requires real sid, fixed same-origin request and a complete CSRF pair', async () => {
  const endpoint = '/api/v2/auth/mobile/browser/authorize';
  for (const options of [
    { browser: false },
    { headers: { Origin: 'https://topodrive.top' } },
    { headers: { Origin: '' } },
    { headers: { 'X-CSRF-Token': '' } },
    { headers: { 'X-CSRF-Token': 'incorrect' } },
    { headers: { Cookie: `csrf=${f.owner.csrf}` } },
    { headers: { Cookie: `sid=${'0'.repeat(64)}; csrf=${f.owner.csrf}` } },
    { headers: { Authorization: `Bearer ma.${'a'.repeat(32)}.${'b'.repeat(64)}` } },
  ]) {
    const response = await request(endpoint, { ...options, body: { state, codeChallenge: challenge } });
    assert.ok([401, 403].includes(response.status), `expected rejection, got ${response.status}`);
    privacy(response);
  }
  const invalid = await request(endpoint, { body: { state: 'invalid', codeChallenge: challenge } });
  assert.equal(invalid.status, 400);
  privacy(invalid);
});

test('only the hash is stored; wrong verifier does not consume; exchange is cookie-free and one-use', async () => {
  const code = await issue();
  const digest = createHash('sha256').update(code).digest('hex');
  const rows = await f.db.select().from(authSessions).where(eq(authSessions.token, `nh.${challenge}.${digest}`));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token.includes(code), false);
  const wrong = await exchange(code, 'x'.repeat(43));
  assert.equal(wrong.status, 400);
  privacy(wrong);
  const pair = await exchange(code);
  assert.equal(pair.status, 200);
  privacy(pair);
  assert.match(pair.body.accessToken, /^ma\.[a-f0-9]{32}\.[a-f0-9]{64}$/);
  assert.match(pair.body.refreshToken, /^mr\.[a-f0-9]{32}\.[a-f0-9]{64}$/);
  const persisted = await f.db.select().from(authSessions).where(eq(authSessions.token, pair.body.accessToken));
  assert.equal(persisted[0].userId, f.owner.id);
  assert.equal((await exchange(code)).status, 400);
});

test('simultaneous exchanges mint exactly one token pair, including the unversioned alias', async () => {
  const code = await issue('/api');
  const responses = await Promise.all([exchange(code), exchange(code)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);
  responses.forEach(privacy);
});

test('expired/malformed codes and verifiers cannot mint credentials', async () => {
  const code = randomBytes(32).toString('hex');
  const digest = createHash('sha256').update(code).digest('hex');
  const token = `nh.${challenge}.${digest}`;
  await f.db.insert(authSessions).values({ token, userId: f.owner.id, expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await exchange(code)).status, 400);
  assert.equal((await exchange('bad')).status, 400);
  assert.equal((await exchange(code, 'short')).status, 400);
  assert.equal((await exchange(code, '/'.repeat(43))).status, 400);
});

test('exchange ignores stale browser csrf cookies, and rate-limited failures remain private', async () => {
  const code = await issue();
  assert.equal((await exchange(code, verifier, { headers: { Cookie: 'csrf=stale' } })).status, 200);
  let limited;
  for (let i = 0; i < 11; i++) limited = await exchange('0'.repeat(64), verifier, { ip: '203.0.113.99' });
  assert.equal(limited.status, 429);
  privacy(limited);
});
