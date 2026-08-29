/* Scratch visual-QA harness for the Cowork-reference UI pass.
   Boots the dev server with a mocked /api/* surface, then captures the
   home landing and a chat transcript at the reference viewport.
   Not part of the app — delete when the pass lands. */
import { chromium } from 'playwright';

const URL = process.env.QA_URL || 'http://localhost:5173/';
const OUT_DIR = process.env.QA_OUT_DIR || 'tmp-shots';
const TAG = process.env.QA_TAG || 'now';
const W = Number(process.env.QA_W || 1024);
const H = Number(process.env.QA_H || 601);

const MOCK_USER = {
  id: 'u-1', email: 'jiacheng@example.test', name: 'Jiacheng',
  verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes',
  customInstructions: '', webSearchOn: true,
};

const json = (body, status = 200) => ({
  status, contentType: 'application/json',
  body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' },
});

const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await ctx.addCookies([
  { name: 'csrf', value: 'qa', domain: 'localhost', path: '/' },
  { name: 'xsrf-token', value: 'qa', domain: 'localhost', path: '/' },
  { name: 'sid', value: 'qa-sid', domain: 'localhost', path: '/' },
]);
const page = await ctx.newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem('socrates-lang-app', 'en');
    localStorage.setItem('socrates-theme', 'dark');
    localStorage.setItem('socrates-cookie-consent', JSON.stringify({
      v: 1, choice: 'accept', nonEssential: true, updatedAt: new Date().toISOString(),
    }));
  } catch (_) {}
});
await page.route('**/api/**', async (route) => {
  const req = route.request();
  const u = route.request().url().replace('/api/v2/', '/api/');
  if (u.includes('/api/auth/me')) return route.fulfill(json({ user: MOCK_USER }));
  if (u.includes('/api/config')) return route.fulfill(json({ hasBeagleKey: true }));
  if (u.includes('/api/auth/csrf-token')) return route.fulfill(json({ csrfToken: 'qa', ok: true }));
  if (u.includes('/api/sessions')) {
    if (req.method() === 'GET') {
      return route.fulfill(json({
        sessions: [
          { id: 's1', title: 'Claude-style chat UI', topic: 'Claude-style chat UI', updatedAt: '2026-08-29T10:00:00Z', createdAt: '2026-08-28T10:00:00Z', mode: 'chat', messageCount: 24 },
          { id: 's2', title: 'Refactor tool rendering', topic: 'Refactor tool rendering', updatedAt: '2026-08-28T09:00:00Z', createdAt: '2026-08-27T09:00:00Z', mode: 'chat', messageCount: 12 },
          { id: 's3', title: 'Deploy script rollback path', topic: 'Deploy script rollback path', updatedAt: '2026-08-26T09:00:00Z', createdAt: '2026-08-26T09:00:00Z', mode: 'chat', messageCount: 8 },
        ],
      }));
    }
    return route.fulfill(json({ session: { id: 'qa-saved' } }));
  }
  if (u.includes('/api/api-key')) return route.fulfill(json({ providers: [], activeId: null }));
  return route.fulfill(json({ ok: true, stub: true }));
});

await page.goto(URL, { waitUntil: 'networkidle', timeout: 40000 });
await page.waitForFunction(
  () => ['app', 'auth'].includes(document.documentElement.dataset.bootState),
  null, { timeout: 20000 },
).catch(() => {});
await page.evaluate(() => {
  document.getElementById('authGate')?.classList.add('hidden');
  document.getElementById('appShell')?.classList.remove('hidden');
  document.documentElement.dataset.bootState = 'app';
  document.querySelectorAll('#socratesCookieConsent,.socrates-cookie-consent').forEach((e) => e.remove());
});
await page.waitForTimeout(900);

const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.screenshot({ path: `${OUT_DIR}/${TAG}-home.png` });
console.log('saved', `${OUT_DIR}/${TAG}-home.png`);

/* ---- chat transcript ---- */
await page.evaluate(async () => {
  document.getElementById('topicSetup')?.classList.add('hidden');
  document.getElementById('chatView')?.classList.remove('hidden');
  const list = document.getElementById('msgList');
  if (!list) return;
  list.innerHTML = '';
  const md = await import('/src/render/markdown.js').catch(() => null);
  const renderMd = (t) => { try { return md?.formatMsg ? md.formatMsg(t) : `<p>${t}</p>`; } catch (_) { return `<p>${t}</p>`; } };
  const mod = await import('/src/ui/toolInline.js');

  const user = (t) => {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.innerHTML = `<div class="msg-body">${t}</div>`;
    list.appendChild(el);
  };
  const asst = () => {
    const el = document.createElement('div');
    el.className = 'msg assistant';
    el.innerHTML = '<div class="msg-body"></div><div class="msg-toolbar" style="opacity:1"></div>';
    list.appendChild(el);
    return el.querySelector('.msg-body');
  };
  const seg = (body, t) => {
    const d = document.createElement('div');
    d.className = 'stream-segment';
    d.innerHTML = renderMd(t);
    body.appendChild(d);
  };

  user('审查当前修改，调整前端 UI，精修一下');
  const b1 = asst();
  seg(b1, 'Let me read the current styles and the landing markup first.');
  {
    const members = [
      { id: 'g1', name: 'Read', input: { file_path: 'frontend/src/styles.css' }, result: { ok: true, durationMs: 40, output: ':root { ... }' } },
      { id: 'g2', name: 'Read', input: { file_path: 'frontend/index.html' }, result: { ok: true, durationMs: 30, output: '<!DOCTYPE html>' } },
      { id: 'g3', name: 'Grep', input: { pattern: 'home-idea' }, result: { ok: true, durationMs: 20, output: '9 matches' } },
      { id: 'g4', name: 'Edit', input: { file_path: 'frontend/src/styles.css' }, result: { ok: true, durationMs: 12, output: 'updated' } },
    ];
    const head = mod.createInlineToolRow({ id: 'g1', name: 'Read', input: members[0].input });
    head.dataset.groupIds = members.map((m) => m.id).join(',');
    b1.appendChild(head);
    mod.updateInlineToolGroupLabel(head, members.length);
    mod.settleInlineToolGroupRow(head, members);
  }
  seg(b1, `## What changed

1. **Sidebar** — nav rows tightened to a 28 px rhythm and the label size dropped to 13 px.
2. **Composer** — the model row now sits inside the card instead of below it.

\`\`\`css
.home-idea { border-radius: 10px; }
\`\`\`

The landing hero keeps its serif greeting.`);
  user('good, keep going');
  const b2 = asst();
  seg(b2, 'Running the build to confirm nothing regressed.');
  {
    const r = mod.createInlineToolRow({ id: 'b1', name: 'Bash', input: { command: 'npm run build' } });
    b2.appendChild(r);
    mod.settleInlineToolRow(r, { ok: true, durationMs: 8400, output: 'built in 8.4s' });
  }
  seg(b2, 'Build is clean.');
  const cv = document.getElementById('chatView');
  if (cv) cv.scrollTop = cv.scrollHeight;
});
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT_DIR}/${TAG}-chat.png` });
console.log('saved', `${OUT_DIR}/${TAG}-chat.png`);
if (errs.length) console.log('console errors:', errs.slice(0, 8));
await b.close();
