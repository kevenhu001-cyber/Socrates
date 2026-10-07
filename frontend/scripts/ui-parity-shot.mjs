// scripts/ui-parity-shot.mjs
// Visual parity audit: baseline SPA (frontend/dist) vs Universal App web
// export (apps/socrates/dist) in the SAME fixture state — same viewport,
// same user, same two transcript messages — then write side-by-side
// screenshots + computed-style probes to test-results/ui-parity/.
//
// Run:
//   cd frontend && npm run build
//   cd ../apps/socrates && npm run export:web
//   node scripts/ui-parity-shot.mjs
//
// Everything is mocked at the page.route level; no backend is contacted.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from '../e2e/_mock-api.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, '..');
const universalDist = join(frontend, '..', 'apps', 'socrates', 'dist');
const outDir = join(frontend, 'test-results', 'ui-parity');
const BASE_PORT = Number(process.env.PARITY_BASE_PORT || 4183);
const RN_PORT = Number(process.env.PARITY_RN_PORT || 4185);

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

/* Identical fixture on both shells: same topic, same two messages (the
 * chat-workbench baseline fixture). */
const FIXTURE = {
  topic: 'Workbench fixture',
  messages: [
    { clientId: 'fixture-user', role: 'user', rawText: 'Build a compact workbench.', html: '<p>Build a compact workbench.</p>' },
    { clientId: 'fixture-assistant', role: 'assistant', rawText: 'The workbench is ready.', html: '<p>The workbench is ready.</p>' },
  ],
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStatic(dist, port) {
  const server = createServer(async (req, res) => {
    try {
      const path = (req.url || '/').split('?')[0];
      const file = join(dist, path === '/' ? 'index.html' : decodeURIComponent(path.slice(1)));
      if (!file.startsWith(dist)) { res.writeHead(403); res.end(); return; }
      const body = await readFile(file).catch(() => readFile(join(dist, 'index.html')));
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(500); res.end(); }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/* Universal App mocks — same route set as universal-app.spec, plus the
 * fixture transcript on s1. */
async function mockUniversal(page) {
  const sessions = [{ id: 's1', title: FIXTURE.topic, topic: '', mode: 'chat', phase: 'chat', projectId: null }];
  const fulfill = (route, body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/auth/me', (route) => fulfill(route, { user: { id: 'u1', email: 't@e.c', displayName: 'T', isGuest: false } }));
  await page.route('**/api/v2/projects', (route) => fulfill(route, { projects: [] }));
  await page.route('**/api/v2/sessions?limit=50', (route) => fulfill(route, { sessions }));
  await page.route('**/api/v2/sessions?limit=50&archived=true', (route) => fulfill(route, { sessions: [], nextCursor: null }));
  await page.route('**/api/v2/api-key', (route) => fulfill(route, { providers: [], activeId: null }));
  await page.route('**/api/v2/creations/items/assistants', (route) => fulfill(route, { items: [] }));
  await page.route('**/api/v2/account/usage', (route) => fulfill(route, {
    user: { id: 'u1', email: 't@e.c', displayName: 'T', tier: 'diophantus' },
    plan: { name: 'Diophantus' },
    usage: { sessionCount: 1, providerCount: 0, graphNodes: 0, beagleUsed: 0, beagleLimit: 1000000 },
  }));
  await page.route('**/api/v2/sessions/s1', (route) => fulfill(route, { ...sessions[0], messages: FIXTURE.messages }));
  await page.route('**/api/v2/search', (route) => fulfill(route, { hits: [] }));
  await page.route('**/api/v2/auth/mobile/refresh', (route) => fulfill(route, {
    accessToken: 'stub', refreshToken: 'stub', expiresAt: new Date(Date.now() + 600_000).toISOString(),
  }));
}

async function settle(page) {
  await page.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {});
  await page.waitForTimeout(500);
}

const PROBE = () => {
  const bodyStyle = getComputedStyle(document.body);
  const firstVisible = [...document.body.querySelectorAll('div')].find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > window.innerWidth * 0.8 && r.height > window.innerHeight * 0.8;
  });
  const surface = firstVisible ? getComputedStyle(firstVisible) : null;
  return {
    title: document.title,
    bodyBg: bodyStyle.backgroundColor,
    bodyColor: bodyStyle.color,
    bodyFont: bodyStyle.fontFamily.slice(0, 90),
    surfaceBg: surface ? surface.backgroundColor : null,
  };
};

async function shotBaseline(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await mockAuthedApp(page);
  await page.goto(`http://127.0.0.1:${BASE_PORT}/`, { waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);
  await page.evaluate(({ topic, messages, sessionId }) => {
    const s = window.stateStore;
    s.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    s.dispatch({ type: 'state/set', key: 'topic', value: topic });
    s.dispatch({ type: 'state/set', key: 'currentSessionId', value: sessionId });
    if (s.read('session')) s.dispatch({ type: 'state/set', key: 'currentSessionId', value: sessionId });
    s.dispatch({ type: 'state/set', key: 'messages', value: messages });
    window.__testActivateMainView('chatView');
    document.body.dataset.conversationActive = 'true';
    window.__socratesReactChatBridge?.publish({ type: 'state-synced', reason: 'parity-fixture' });
  }, { ...FIXTURE, sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  await settle(page);
  const probe = await page.evaluate(PROBE);
  await page.screenshot({ path: join(outDir, `baseline-${viewport.name}.png`) });
  await context.close();
  return probe;
}

async function shotUniversal(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await mockUniversal(page);
  await page.goto(`http://127.0.0.1:${RN_PORT}/`, { waitUntil: 'domcontentloaded' });
  // The chat shell ready marker (same as universal-app.spec).
  await page.getByRole('button', { name: 'Open projects' }).waitFor({ state: 'visible', timeout: 20000 });
  // Make sure the fixture session is the active transcript: click its row
  // when visible (desktop sidebar / mobile via the toggle).
  const row = page.getByRole('button', { name: FIXTURE.topic, exact: true });
  if (!(await row.isVisible().catch(() => false))) {
    const toggle = page.getByRole('button', { name: 'Toggle sidebar' });
    if (await toggle.isVisible().catch(() => false)) { await toggle.click().catch(() => {}); await settle(page); }
  }
  if (await row.isVisible().catch(() => false)) { await row.click().catch(() => {}); await settle(page); }
  await page.getByText(FIXTURE.messages[1].rawText, { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await settle(page);
  const probe = await page.evaluate(PROBE);
  await page.screenshot({ path: join(outDir, `universal-${viewport.name}.png`) });
  await context.close();
  return probe;
}

async function report(results) {
  const img = async (name) => `data:image/png;base64,${(await readFile(join(outDir, name))).toString('base64')}`;
  const pair = async (vp) => `
  <section>
    <h2>${vp}</h2>
    <div class="pair">
      <figure><figcaption>baseline (frontend/ SPA)</figcaption><img src="${await img(`baseline-${vp}.png`)}" alt="baseline ${vp}"></figure>
      <figure><figcaption>Universal App (apps/socrates RN)</figcaption><img src="${await img(`universal-${vp}.png`)}" alt="universal ${vp}"></figure>
    </div>
  </section>`;
  const probeRows = VIEWPORTS.map((vp) => {
    const b = results.baseline[vp.name];
    const u = results.universal[vp.name];
    const cells = (label, key) => `<tr><td>${label}</td><td>${b[key] ?? '—'}</td><td>${u[key] ?? '—'}</td></tr>`;
    return `
      <h3>${vp.name} (${vp.width}×${vp.height})</h3>
      <table><tr><th>probe</th><th>baseline</th><th>universal</th></tr>
      ${cells('body background', 'bodyBg')}${cells('body text', 'bodyColor')}${cells('font-family', 'bodyFont')}${cells('main surface bg', 'surfaceBg')}
      </table>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><title>UI parity: baseline vs Universal</title>
<style>
  body{font:14px system-ui;margin:24px;background:#111;color:#eee}
  .pair{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
  figure{margin:0;flex:1 1 480px;min-width:320px}
  figcaption{padding:6px 0;font-weight:600}
  img{width:100%;border:1px solid #444;border-radius:6px}
  table{border-collapse:collapse;margin:8px 0 24px}
  td,th{border:1px solid #444;padding:4px 10px;text-align:left}
  h3{margin:18px 0 4px}
</style>
<h1>UI parity audit — baseline SPA vs Universal App (RN)</h1>
<p>Same viewport, same mock user, same fixture transcript. Generated by <code>scripts/ui-parity-shot.mjs</code>.</p>
${(await Promise.all(VIEWPORTS.map((vp) => pair(vp.name)))).join('')}
<h2>Computed-style probes</h2>
${probeRows}`;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  // Baseline static server: reuse the production-CSP dist-server.
  const baselineSrv = spawn(process.execPath, [join(frontend, 'e2e', 'dist-server.mjs')], {
    cwd: frontend,
    env: { ...process.env, SMOKE_PORT: String(BASE_PORT) },
    stdio: 'ignore',
  });
  const rnSrv = await serveStatic(universalDist, RN_PORT);
  const browser = await chromium.launch();
  const results = { baseline: {}, universal: {} };
  try {
    for (const viewport of VIEWPORTS) {
      console.log(`[parity] ${viewport.name}: baseline…`);
      results.baseline[viewport.name] = await shotBaseline(browser, viewport);
      console.log(`[parity] ${viewport.name}: universal…`);
      results.universal[viewport.name] = await shotUniversal(browser, viewport);
    }
  } finally {
    await browser.close();
    rnSrv.close();
    baselineSrv.kill();
  }
  const html = await report(results);
  await writeFile(join(outDir, 'report.html'), html);
  await writeFile(join(outDir, 'probes.json'), JSON.stringify(results, null, 2));
  console.log(`[parity] wrote ${join(outDir, 'report.html')}`);
}

await main();
