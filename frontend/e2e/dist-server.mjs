#!/usr/bin/env node
/* Wave -1 of main-js-split plan.
 * Tiny static file server for dist/. Used by playwright as the test web server.
 * Run standalone:    node e2e/dist-server.mjs
 * From playwright:   see playwright.config.mjs webServer.command
 */
import http from 'node:http';
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');
const port = Number(process.env.SMOKE_PORT || 4173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    let fp = resolve(distDir, '.' + pathname);
    if (pathname === '/' || pathname === '') fp = resolve(distDir, 'index.html');
    if (!fp.startsWith(distDir)) { res.writeHead(403).end('forbidden'); return; }
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
      // SPA fallback to index.html so history-routed paths resolve
      fp = resolve(distDir, 'index.html');
    }
    const ext = (fp.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[dist-server] http://127.0.0.1:${port} (serving ${distDir})`);
});
