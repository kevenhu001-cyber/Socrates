import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', '..', 'apps', 'socrates', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  const file = join(dist, path === '/' ? 'index.html' : decodeURIComponent(path.slice(1)));
  if (!file.startsWith(dist)) { res.writeHead(403); res.end(); return; }
  const body = await readFile(file).catch(() => readFile(join(dist, 'index.html')));
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(body);
});
server.listen(4175, '127.0.0.1', () => console.log('serving', dist, 'on 4175'));
