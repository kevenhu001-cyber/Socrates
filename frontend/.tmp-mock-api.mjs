#!/usr/bin/env node
/* TEMP verification harness (not committed): minimal /api mock so the built
 * SPA boots into its post-auth shell when driven by an external browser.
 * Mirrors the endpoint list in e2e/_mock-api.mjs. */
import http from 'node:http';

const USER = {
  id: 'u-test-1',
  email: 'smoke@example.test',
  name: 'Smoke Test',
  verifiedAt: '2026-01-01T00:00:00Z',
  plan: 'descartes',
  customInstructions: '',
  webSearchOn: true,
};

function json(res, body, status = 200) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  });
  res.end(payload);
}

const EMPTY = { items: [], list: [], count: 0, ok: true };

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0].replace('/api/v2/', '/api/');
  if (url === '/api/auth/me') return json(res, { user: USER });
  if (url === '/api/config') return json(res, { hasBeagleKey: true });
  if (url === '/api/auth/csrf-token') return json(res, { csrfToken: 'smoke-csrf-token', ok: true });
  if (url.startsWith('/api/sessions')) {
    if (req.method === 'GET') return json(res, { sessions: [] });
    return json(res, { session: { id: 'smoke-saved-1' } });
  }
  if (url.startsWith('/api/api-key')) {
    if (req.method === 'GET') return json(res, { providers: [], activeId: null });
    if (req.method === 'POST') return json(res, { id: 'smoke-provider-1' }, 201);
    return json(res, { ok: true });
  }
  if (url.startsWith('/api/memories') || url.startsWith('/api/usage') ||
      url.startsWith('/api/projects') || url.startsWith('/api/share') ||
      url.startsWith('/api/mistakes')) {
    return json(res, EMPTY);
  }
  return json(res, { ok: true, stub: true });
});

server.listen(4176, '127.0.0.1', () => console.log('[tmp-mock-api] 127.0.0.1:4176'));
