import http from 'node:http';
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, 'dist');
const BASE = 'http://127.0.0.1:4188';
const OUT = 'C:\\Users\\Jiacheng\\Desktop\\Socrates\\tmp-shots';

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
      fp = resolve(distDir, 'index.html');
    }
    const ext = (fp.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});

const MOCK_USER = {
  id: 'u-user-1',
  email: 'adex@example.com',
  displayName: 'Adex Hu',
  name: 'Adex Hu',
  tier: 'Plus',
  plan: 'Plus',
  verifiedAt: '2026-01-01T00:00:00Z',
  customInstructions: '',
  webSearchOn: true,
};

const RECENT_TITLES = [
  '会员到期点数生效',
  '推荐开源项目',
  '概念口号化解构分析',
  'Antigravity反代方法',
  '解决本地预览拦截',
  'Aspen安装问题排查',
  'Qwen模型部署比较',
  '问候交流',
  '运行Qwen27B量化模型',
  '你好问候',
  '浏览器调试方式比较',
  '查看Github仓库',
];

const MOCK_SESSIONS = {
  sessions: RECENT_TITLES.map((title, i) => ({
    id: `sess-${i + 1}`,
    title,
    updatedAt: new Date(Date.now() - i * 3600000).toISOString(),
    createdAt: new Date(Date.now() - i * 3600000).toISOString(),
    pinned: false,
    archived: false,
  })),
};

const MOCK_PROJECTS = {
  items: [
    {
      id: 'proj-1',
      name: 'Socrates',
      title: 'Socrates',
      updatedAt: '2026-07-29T10:00:00Z',
      updated_at: '2026-07-29T10:00:00Z',
      createdAt: '2026-07-29T10:00:00Z',
      sessionCount: 12,
    },
  ],
  list: [
    {
      id: 'proj-1',
      name: 'Socrates',
      title: 'Socrates',
      updatedAt: '2026-07-29T10:00:00Z',
      updated_at: '2026-07-29T10:00:00Z',
      createdAt: '2026-07-29T10:00:00Z',
      sessionCount: 12,
    },
  ],
  projects: [
    {
      id: 'proj-1',
      name: 'Socrates',
      title: 'Socrates',
      updatedAt: '2026-07-29T10:00:00Z',
      updated_at: '2026-07-29T10:00:00Z',
      createdAt: '2026-07-29T10:00:00Z',
      sessionCount: 12,
    },
  ],
};

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Access-Control-Allow-Origin': '*' },
  };
}

async function setupMockApi(page) {
  await page.context().addCookies([
    { name: 'csrf', value: 'snap-csrf', domain: '127.0.0.1', path: '/' },
    { name: 'xsrf-token', value: 'snap-csrf', domain: '127.0.0.1', path: '/' },
    { name: 'sid', value: 'snap-sid', domain: '127.0.0.1', path: '/' },
  ]);

  await page.addInitScript(() => {
    try {
      localStorage.setItem('socrates-lang-app', 'zh-CN');
      localStorage.setItem('socrates-theme', 'dark');
      localStorage.setItem('socrates-sb', '1');
      localStorage.setItem('socrates-cookie-consent', JSON.stringify({
        v: 1, choice: 'accept', nonEssential: true, updatedAt: new Date().toISOString(),
      }));
    } catch (_) {}
  });

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = req.url().replace('/api/v2/', '/api/');

    if (url.includes('/api/auth/me')) {
      await route.fulfill(jsonResponse({ user: MOCK_USER }));
      return;
    }
    if (url.includes('/api/auth/csrf-token')) {
      await route.fulfill(jsonResponse({ csrfToken: 'snap-csrf', ok: true }));
      return;
    }
    if (url.includes('/api/config')) {
      await route.fulfill(jsonResponse({ hasBeagleKey: true, model: 'gpt-4o' }));
      return;
    }
    if (url.includes('/api/sessions')) {
      if (req.method() === 'GET') {
        await route.fulfill(jsonResponse(MOCK_SESSIONS));
      } else {
        await route.fulfill(jsonResponse({ session: { id: 'snap-sess-1' } }));
      }
      return;
    }
    if (url.includes('/api/projects')) {
      await route.fulfill(jsonResponse(MOCK_PROJECTS));
      return;
    }
    if (url.includes('/api/project-connectors')) {
      await route.fulfill(jsonResponse({
        mode: 'oomol-project-connector',
        configured: true,
        connectors: [
          { id: 'gmail', name: 'Gmail', description: 'Read and manage Gmail', capabilities: ['Mail search'], authType: 'oauth', connection: null },
          { id: 'github', name: 'GitHub', description: 'Triage PRs, issues, CI, and publish flows', capabilities: ['Repositories'], authType: 'oauth', connection: null },
          { id: 'googledrive', name: 'Google Drive', description: 'Drive, Docs, Sheets or Slides', capabilities: ['Files'], authType: 'oauth', connection: null },
          { id: 'slack', name: 'Slack', description: 'Read and manage Slack', capabilities: ['Messages'], authType: 'oauth', connection: null },
          { id: 'outlook', name: 'Outlook Email', description: 'Triage Outlook inboxes', capabilities: ['Mail'], authType: 'oauth', connection: null },
          { id: 'canva', name: 'Canva', description: 'Create, review, edit designs', capabilities: ['Designs'], authType: 'oauth', connection: null },
        ],
      }));
      return;
    }
    if (url.includes('/api/connectors')) {
      await route.fulfill(jsonResponse({
        connectors: [
          { id: 'gmail', name: 'Gmail', description: 'Read and manage Gmail', availability: 'available', configured: true, connection: null },
          { id: 'github', name: 'GitHub', description: 'Triage PRs, issues, CI, and publish flows', availability: 'available', configured: true, connection: null },
          { id: 'googledrive', name: 'Google Drive', description: 'Drive, Docs, Sheets or Slides', availability: 'available', configured: true, connection: null },
          { id: 'slack', name: 'Slack', description: 'Read and manage Slack', availability: 'available', configured: true, connection: null },
          { id: 'outlook', name: 'Outlook Email', description: 'Triage Outlook inboxes', availability: 'available', configured: true, connection: null },
          { id: 'canva', name: 'Canva', description: 'Create, review, edit designs', availability: 'available', configured: true, connection: null },
        ],
      }));
      return;
    }
    await route.fulfill(jsonResponse({ ok: true, items: [], list: [] }));
  });
}

async function shot(page, name) {
  const out = `${OUT}\\${name}.png`;
  await page.screenshot({ path: out, fullPage: false });
  console.log('saved', out);
}

server.listen(4188, '127.0.0.1', async () => {
  let browser;
  try {
    await mkdir(OUT, { recursive: true });
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    await setupMockApi(page);
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      document.querySelectorAll('.socrates-cookie-consent, #socratesCookieConsent').forEach(e => e.remove());
      document.querySelectorAll('.toast, [role="alert"]').forEach(e => e.remove());
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('collapsed');
    });
    await page.waitForTimeout(600);

    // 1. Home
    await shot(page, 'final-home');

    // 2. Open projects
    try {
      await page.evaluate(() => {
        if (typeof window.openNav === 'function') {
          window.openNav('projects');
        } else {
          document.getElementById('navProjects')?.click();
        }
      });
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        document.querySelectorAll('.toast, [role="alert"]').forEach(e => e.remove());
      });
      await shot(page, 'final-projects');
    } catch (e) { console.error('projects capture error:', e); }

    // 3. Open plugins
    try {
      await page.evaluate(() => {
        if (typeof window.openNav === 'function') {
          window.openNav('plugins');
        } else {
          document.getElementById('navPlugins')?.click();
        }
      });
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        document.querySelectorAll('.toast, [role="alert"]').forEach(e => e.remove());
      });
      await shot(page, 'final-plugins');
    } catch (e) { console.error('plugins capture error:', e); }

  } catch (err) {
    console.error(err);
  } finally {
    if (browser) await browser.close();
    server.close();
    process.exit(0);
  }
});
