// scripts/run-universal-smoke.mjs
// One-command Universal App gate: export apps/socrates for web, serve
// dist/ on :4175, run the universal Playwright spec, then tear down.
// Exit code mirrors the spec result so CI can call it directly.
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, '..');
const app = join(here, '..', '..', 'apps', 'socrates');
const dist = join(app, 'dist');
const PORT = Number(process.env.UNIVERSAL_PORT || 4175);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

console.log('[universal] exporting web bundle…');
const apiBaseUrl = process.env.UNIVERSAL_API_BASE_URL || 'http://127.0.0.1:4176/api/v2';
execSync('npm run export:web', { cwd: app, stdio: 'inherit', env: { ...process.env, EXPO_PUBLIC_API_BASE_URL: apiBaseUrl } });
execSync('node scripts/check-api-bundle.mjs', { cwd: app, stdio: 'inherit', env: { ...process.env, EXPO_PUBLIC_API_BASE_URL: apiBaseUrl } });

const server = createServer(async (req, res) => {
  try {
    const path = (req.url || '/').split('?')[0];
    const file = join(dist, path === '/' ? 'index.html' : decodeURIComponent(path.slice(1)));
    if (!file.startsWith(dist)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const body = await readFile(file).catch(() => readFile(join(dist, 'index.html')));
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end();
  }
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
console.log(`[universal] serving ${dist} on :${PORT}`);
const child = spawn('npx', ['playwright', 'test', '--config=playwright.universal.config.mjs'], {
  cwd: frontend,
  stdio: 'inherit',
  env: { ...process.env, UNIVERSAL_BASE_URL: `http://127.0.0.1:${PORT}` },
});
const code = await new Promise((resolve) => child.on('close', resolve));
server.close();
process.exit(code ?? 1);
