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

/* Production Content-Security-Policy, read from the generated nginx snippet.
 *
 * Why this matters: the SPA is served in production by nginx with
 * ops/nginx/csp-spa.conf applied, but Playwright used to hit this server with
 * no CSP at all. That left the strictest thing about the production
 * environment completely untested — a policy that blocks the app's own inline
 * boot script is a white screen for every user, and nothing in the suite would
 * have caught it.
 *
 * Parsed from the generated file rather than duplicated here, so the header the
 * tests run against cannot drift from the header nginx sends.
 * scripts/gen-csp-hashes.mjs owns both.
 *
 * Set SMOKE_NO_CSP=1 to serve without it when bisecting whether a failure is
 * CSP-related.
 */
function productionCsp() {
  if (process.env.SMOKE_NO_CSP === '1') return null;
  const conf = resolve(__dirname, '..', '..', 'ops', 'nginx', 'csp-spa.conf');
  if (!fs.existsSync(conf)) {
    console.warn('[dist-server] ops/nginx/csp-spa.conf missing — serving without a CSP.');
    console.warn('[dist-server] regenerate with: node scripts/gen-csp-hashes.mjs --update');
    return null;
  }
  const match = /add_header\s+Content-Security-Policy\s+"([^"]+)"/.exec(
    fs.readFileSync(conf, 'utf8'),
  );
  if (!match) {
    console.warn('[dist-server] could not parse a policy out of csp-spa.conf');
    return null;
  }
  return match[1];
}

const CSP = productionCsp();
if (CSP) console.log(`[dist-server] serving the production CSP (${CSP.length} chars)`);

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
    const headers = { 'Content-Type': types[ext] || 'application/octet-stream' };
    /* HTML documents only — the nginx config includes the snippet in the two
       HTML-serving location blocks and leaves /assets/ alone, because a CSP on
       a .js response does nothing. Mirroring that here keeps the test
       environment faithful. */
    if (CSP && ext === '.html') headers['Content-Security-Policy'] = CSP;
    res.writeHead(200, headers);
    fs.createReadStream(fp).pipe(res);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[dist-server] http://127.0.0.1:${port} (serving ${distDir})`);
});
