const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'dist');
const connectors = [
  { id: 'github', name: 'GitHub', description: 'Bring repositories, issues, pull requests, and CI context into a chat.', capabilities: ['Repositories', 'Issues', 'Pull requests'], authType: 'oauth', connection: null },
  { id: 'gmail', name: 'Gmail', description: 'Search mail context that you explicitly authorize.', capabilities: ['Mail search'], authType: 'oauth', connection: null },
  { id: 'googledrive', name: 'Google Drive', description: 'Bring files and folders from your Google Drive into a chat.', capabilities: ['Files', 'Folders'], authType: 'oauth', connection: null },
  { id: 'googlecalendar', name: 'Google Calendar', description: 'Use your schedule and event context when planning study sessions.', capabilities: ['Events'], authType: 'oauth', connection: null },
  { id: 'notion', name: 'Notion', description: 'Search pages and knowledge you share with Socrates.', capabilities: ['Page search'], authType: 'oauth', connection: null },
];

function json(res, body, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

function sendFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
  };
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:5184');
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname.endsWith('/auth/me')) return json(res, { user: { id: 'u-ui', email: 'ui@example.test', name: 'UI Tester', verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes', customInstructions: '', webSearchOn: true } });
    if (url.pathname.endsWith('/config')) return json(res, { hasBeagleKey: true });
    if (url.pathname.endsWith('/project-connectors')) return json(res, { mode: 'oomol-project-connector', configured: true, connectors });
    if (url.pathname.includes('/sessions')) return json(res, { sessions: [] });
    if (url.pathname.includes('/projects')) return json(res, { projects: [] });
    if (url.pathname.includes('/scheduled-tasks')) return json(res, { tasks: [] });
    return json(res, { ok: true, items: [], list: [], count: 0 });
  }

  const safe = path.normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
  const file = path.join(root, safe || 'index.html');
  if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) return sendFile(res, file);
  return sendFile(res, path.join(root, 'index.html'));
}).listen(5184, '127.0.0.1', () => {
  console.log('mock ui server http://127.0.0.1:5184');
});
