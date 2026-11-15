import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { listen } from './_http.js';
import { ApiError, BadRequest } from '../src/lib/errors.js';
import { createFaviconRouter } from '../src/routes/favicons.js';
import { faviconTarget, getFavicon, readFavicon, sniffImage } from '../src/services/favicons.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];
const target = (host) => faviconTarget(`https://${host}/article`);

test('only public http(s) site origins can become favicon targets', () => {
  assert.equal(faviconTarget('https://example.test/article?q=1').href, 'https://example.test/favicon.ico');
  assert.equal(faviconTarget('http://example.test:80/').href, 'http://example.test/favicon.ico');
  for (const value of [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'https://user:pass@example.test/',
    'https://example.test:8443/',
    'http://127.0.0.1/',
    'http://[::1]/',
    'https://169.254.169.254/latest/meta-data/',
    ['https://example.test/'],
    `https://${'a'.repeat(2050)}.test/`,
  ]) assert.throws(() => faviconTarget(value), (error) => error instanceof BadRequest);
});

test('image types are sniffed from bytes instead of trusting the upstream label', () => {
  assert.equal(sniffImage(PNG), 'image/png');
  assert.equal(sniffImage(Buffer.from([0, 0, 1, 0, 1, 0, 16, 16])), 'image/x-icon');
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffImage(Buffer.from('GIF89a')), 'image/gif');
  assert.equal(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])), 'image/webp');
  assert.equal(sniffImage(Buffer.from('<html>not an icon</html>')), null);
});

test('an icon read follows validated redirects and stays bounded', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    if (seen.length === 1) return new Response(null, { status: 302, headers: { location: '/assets/icon.png' } });
    return new Response(PNG, { headers: { 'content-type': 'text/plain', 'content-length': String(PNG.length) } });
  };
  const icon = await readFavicon(target('redirect.example'), { fetchImpl, resolve: publicDns });
  assert.equal(icon.type, 'image/png');
  assert.deepEqual(icon.bytes, PNG);
  assert.deepEqual(seen, ['https://redirect.example/favicon.ico', 'https://redirect.example/assets/icon.png']);
});

test('private answers, redirects to private hosts, HTML and oversized bodies are rejected', async () => {
  await assert.rejects(
    readFavicon(target('private.example'), {
      resolve: async () => { throw new Error('Blocked: private.example resolves to private IP 127.0.0.1'); },
      fetchImpl: async () => { throw new Error('must not fetch'); },
    }),
    (error) => error instanceof ApiError && error.status === 400,
  );
  await assert.rejects(
    readFavicon(target('hop.example'), {
      resolve: publicDns,
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } }),
    }),
    (error) => error instanceof ApiError && error.status === 400,
  );
  await assert.rejects(
    readFavicon(target('html.example'), { resolve: publicDns, fetchImpl: async () => new Response('<html></html>', { headers: { 'content-type': 'image/png' } }) }),
    (error) => error instanceof ApiError && error.status === 404,
  );
  await assert.rejects(
    readFavicon(target('large.example'), {
      resolve: publicDns,
      fetchImpl: async () => new Response(Buffer.alloc(256 * 1024 + 1), { headers: { 'content-type': 'image/png' } }),
    }),
    (error) => error instanceof ApiError && error.status === 404,
  );
});

test('icon reads are cached by site and failures are not cached', async () => {
  const host = `cache-${randomUUID()}.example`;
  let calls = 0;
  let fail = true;
  const deps = {
    resolve: publicDns,
    fetchImpl: async () => {
      calls++;
      if (fail) return new Response('offline', { status: 503 });
      return new Response(PNG, { headers: { 'content-type': 'image/png' } });
    },
  };
  await assert.rejects(getFavicon(`https://${host}/first`, deps));
  fail = false;
  const first = await getFavicon(`https://${host}/first`, deps);
  const second = await getFavicon(`https://${host}/other/page`, deps);
  assert.equal(first.type, 'image/png');
  assert.equal(second.bytes.length, PNG.length);
  assert.equal(calls, 2);
});

test('the favicon route requires auth, validates before fetching and serves bounded image bytes', async () => {
  const services = {
    getFavicon: async (url) => {
      if (url === 'not a url') throw new BadRequest('Only public http(s) site URLs are allowed');
      return { bytes: PNG, type: 'image/png' };
    },
  };
  const app = express();
  app.use('/api/favicons', createFaviconRouter((req, res, next) => {
    if (!req.headers['x-test-auth']) return res.status(401).end();
    req.userId = 'test-user';
    next();
  }, services));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ code: error.code }));
  const server = await listen(app);
  try {
    const path = `/api/favicons?url=${encodeURIComponent('https://example.test/')}`;
    assert.equal((await fetch(`${server.url}${path}`)).status, 401);
    const invalid = await fetch(`${server.url}/api/favicons?url=not%20a%20url`, { headers: { 'x-test-auth': 'yes' } });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, 'BAD_REQUEST');
    const response = await fetch(`${server.url}${path}`, { headers: { 'x-test-auth': 'yes' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cache-control'), 'private, max-age=86400');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG);
  } finally {
    await server.close();
  }
});
