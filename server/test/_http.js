// @ts-check
/**
 * Tiny test helper: spin up an Express app on an ephemeral port
 * and return a `fetch`-based request function.
 *
 * This keeps us off supertest / axios (not in the project deps) and
 * only relies on Node's built-in fetch (Node 20+).
 */
import http from 'node:http';

/**
 * @param {import('express').Express} app
 * @param {() => Promise<void>} done  close hook
 * @returns {{ url: string, close: () => Promise<void> }}
 */
export function listen(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('failed to bind ephemeral port'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
    server.on('error', reject);
  });
}

/**
 * @param {string} url
 * @param {{
 *   method?: string,
 *   headers?: Record<string, string>,
 *   cookies?: Record<string, string>,
 *   body?: any
 * }} [opts]
 */
export async function httpRequest(url, opts = {}) {
  const method = opts.method || 'GET';
  const headers = { ...(opts.headers || {}) };
  if (opts.cookies) {
    headers['Cookie'] = Object.entries(opts.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  let body;
  if (opts.body !== undefined) {
    if (typeof opts.body === 'string' || Buffer.isBuffer(opts.body)) {
      body = opts.body;
    } else {
      body = JSON.stringify(opts.body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
  }
  const r = await fetch(url, { method, headers, body, redirect: opts.redirect || 'follow' });
  const setCookies = r.headers.getSetCookie?.() || [];
  let json = null;
  const text = await r.text();
  try { json = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  return { status: r.status, headers: r.headers, setCookies, body: json, text };
}
