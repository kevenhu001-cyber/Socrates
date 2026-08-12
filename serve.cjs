// Tiny zero-dependency static server for the site/ folder.
// Usage: node serve.cjs [port]   (default 5173)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'site');
const PORT = parseInt(process.argv[2] || process.env.PORT || '5173', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.txt':  'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  else if (urlPath.endsWith('/')) urlPath += 'index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Resolve extensionless research/article routes to their directory index.
      const directoryIndex = path.join(filePath, 'index.html');
      fs.stat(directoryIndex, (directoryError, directoryStat) => {
        if (!directoryError && directoryStat.isFile()) {
          serve(directoryIndex);
          return;
        }

        // try with .html (pretty URLs)
        const alt = filePath + '.html';
        fs.stat(alt, (e2, s2) => {
          if (e2 || !s2.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 not found: ' + urlPath);
          } else {
            serve(alt);
          }
        });
      });
    } else {
      serve(filePath);
    }
  });

  function serve(p) {
    const ext = path.extname(p).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(p).pipe(res);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}`);
});
