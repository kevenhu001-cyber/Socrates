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
    { id: 'fixture-user', clientId: 'fixture-user', role: 'user', rawText: 'Build a compact workbench.', html: '<p>Build a compact workbench.</p>' },
    { id: 'fixture-assistant', clientId: 'fixture-assistant', role: 'assistant', rawText: 'The workbench is ready.', html: '<p>The workbench is ready.</p>' },
  ],
};
const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FIXTURE_TIME = '2026-10-07T12:00:00.000Z';
const WELCOME_SESSION = {
  id: 'welcome', title: 'Welcome to Socrates', topic: 'Universal app', mode: 'chat', phase: 'chat',
  projectId: null, archivedAt: null, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME,
};
const FIXTURE_SESSION = {
  id: SESSION_ID, title: FIXTURE.topic, topic: FIXTURE.topic, mode: 'chat', phase: 'chat', kind: 'chat',
  projectId: null, archivedAt: null, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME,
};
const PARITY_USER = { id: 'u-parity', email: 'parity@example.test', name: 'Parity User', displayName: 'Parity User', plan: 'descartes', tier: 'descartes' };
const PARITY_PROVIDER = {
  id: 'beagle', label: 'Beagle', url: 'https://api.example.test', model: 'Beagle',
  isActive: true, isBuiltIn: true, hasKey: true,
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
  const sessions = [FIXTURE_SESSION];
  const fulfill = (route, body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/auth/me', (route) => fulfill(route, { user: { ...PARITY_USER, isGuest: false } }));
  await page.route('**/api/v2/projects', (route) => fulfill(route, { projects: [] }));
  await page.route('**/api/v2/sessions?limit=50', (route) => fulfill(route, { sessions }));
  await page.route('**/api/v2/sessions?limit=50&archived=true', (route) => fulfill(route, { sessions: [], nextCursor: null }));
  await page.route('**/api/v2/api-key', (route) => fulfill(route, { providers: [PARITY_PROVIDER], activeId: PARITY_PROVIDER.id }));
  await page.route('**/api/v2/creations/items/assistants', (route) => fulfill(route, { items: [] }));
  await page.route('**/api/v2/account/usage', (route) => fulfill(route, {
    user: { ...PARITY_USER },
    plan: { name: 'Free' },
    usage: { sessionCount: 2, providerCount: 1, graphNodes: 0, beagleUsed: 0, beagleLimit: 1000000 },
  }));
  await page.route(`**/api/v2/sessions/${SESSION_ID}`, (route) => fulfill(route, { ...FIXTURE_SESSION, messages: FIXTURE.messages }));
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
  const context = await browser.newContext({
    viewport,
    ...(viewport.name === 'mobile' ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  await mockAuthedApp(page, { user: PARITY_USER });
  await page.route('**/api/v2/sessions**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') { await route.fallback(); return; }
    const url = new URL(request.url());
    if (url.pathname === '/api/v2/sessions') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [FIXTURE_SESSION, WELCOME_SESSION], nextCursor: null }) });
      return;
    }
    const id = decodeURIComponent(url.pathname.slice('/api/v2/sessions/'.length));
    if (id === SESSION_ID) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...FIXTURE_SESSION, messages: FIXTURE.messages }) });
      return;
    }
    if (id === WELCOME_SESSION.id) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...WELCOME_SESSION, messages: [] }) });
      return;
    }
    await route.fallback();
  });
  await page.goto(`http://127.0.0.1:${BASE_PORT}/`, { waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);
  if (viewport.width <= 768) {
    const openSidebar = page.locator('#sidebarOpenBtn');
    if (await openSidebar.isVisible().catch(() => false)) await openSidebar.click();
  }
  const fixtureRow = page.getByText(FIXTURE.topic, { exact: true });
  await fixtureRow.waitFor({ state: 'visible', timeout: 15000 });
  await fixtureRow.click();
  if (viewport.width <= 768) {
    const closeSidebar = page.locator('#sidebarCloseBtn');
    if (await closeSidebar.isVisible().catch(() => false)) await closeSidebar.click();
  }
  await page.getByText(FIXTURE.messages[1].rawText, { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await settle(page);
  const probe = await page.evaluate(PROBE);
  const screenshot = await page.screenshot({ path: join(outDir, `baseline-${viewport.name}.png`) });
  await context.close();
  return { probe, screenshot };
}

async function shotUniversal(browser, viewport) {
  const context = await browser.newContext({
    viewport,
    ...(viewport.name === 'mobile' ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  await mockUniversal(page);
  await page.goto(`http://127.0.0.1:${RN_PORT}/`, { waitUntil: 'domcontentloaded' });
  // The model switcher is present in both desktop and compact chat shells.
  const modelSwitcher = page.getByRole('button', { name: 'Choose model' });
  await modelSwitcher.waitFor({ state: 'visible', timeout: 20000 });
  await modelSwitcher.click();
  await page.getByRole('button', { name: `Use ${PARITY_PROVIDER.label}`, exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: 'Close model picker' }).click();
  await settle(page);
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
  const screenshot = await page.screenshot({ path: join(outDir, `universal-${viewport.name}.png`) });
  await context.close();
  return { probe, screenshot };
}

async function comparePixels(browser, baseline, universal, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const result = await page.evaluate(async ({ baselinePng, universalPng, width, height }) => {
    const load = (data) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `data:image/png;base64,${data}`;
    });
    const [base, current] = await Promise.all([load(baselinePng), load(universalPng)]);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(base, 0, 0);
    const basePixels = context.getImageData(0, 0, width, height).data;
    context.clearRect(0, 0, width, height);
    context.drawImage(current, 0, 0);
    const currentPixels = context.getImageData(0, 0, width, height).data;
    const diff = context.createImageData(width, height);
    let changed = 0;
    let strong = 0;
    let totalDelta = 0;
    for (let i = 0; i < basePixels.length; i += 4) {
      const delta = Math.max(
        Math.abs(basePixels[i] - currentPixels[i]),
        Math.abs(basePixels[i + 1] - currentPixels[i + 1]),
        Math.abs(basePixels[i + 2] - currentPixels[i + 2]),
      );
      totalDelta += delta;
      if (delta > 12) {
        changed += 1;
        if (delta > 48) strong += 1;
        diff.data[i] = Math.min(255, delta * 3);
        diff.data[i + 1] = 20;
        diff.data[i + 2] = 20;
        diff.data[i + 3] = 255;
      }
    }
    context.putImageData(diff, 0, 0);
    return {
      width,
      height,
      changedPixels: changed,
      strongPixels: strong,
      totalPixels: width * height,
      changedPercent: Math.round((changed / (width * height)) * 10000) / 100,
      meanChannelDelta: Math.round((totalDelta / (width * height)) * 100) / 100,
      diffPng: canvas.toDataURL('image/png').slice('data:image/png;base64,'.length),
    };
  }, {
    baselinePng: baseline.toString('base64'),
    universalPng: universal.toString('base64'),
    width: viewport.width,
    height: viewport.height,
  });
  await writeFile(join(outDir, `diff-${viewport.name}.png`), Buffer.from(result.diffPng, 'base64'));
  delete result.diffPng;
  await page.close();
  return result;
}

async function report(results) {
  const img = async (name) => `data:image/png;base64,${(await readFile(join(outDir, name))).toString('base64')}`;
  const pair = async (vp) => {
    const diff = results.pixelDiff[vp];
    return `
  <section>
    <h2>${vp}</h2>
    <div class="pair">
    <figure><figcaption>baseline (frontend/ SPA)</figcaption><img src="${await img(`baseline-${vp}.png`)}" alt="baseline ${vp}"></figure>
    <figure><figcaption>Universal App (apps/socrates RN)</figcaption><img src="${await img(`universal-${vp}.png`)}" alt="universal ${vp}"></figure>
    <figure><figcaption>Pixel diff (&gt;12/channel)</figcaption><img src="${await img(`diff-${vp}.png`)}" alt="pixel difference ${vp}"></figure>
    </div>
    <p>Changed pixels: ${diff.changedPixels.toLocaleString()} / ${diff.totalPixels.toLocaleString()} (${diff.changedPercent}%). Strong differences (&gt;48/channel): ${diff.strongPixels.toLocaleString()}. Mean channel delta: ${diff.meanChannelDelta}.</p>
  </section>`;
  };
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
  const results = { baseline: {}, universal: {}, pixelDiff: {} };
  try {
    for (const viewport of VIEWPORTS) {
      console.log(`[parity] ${viewport.name}: baseline…`);
      const baseline = await shotBaseline(browser, viewport);
      results.baseline[viewport.name] = baseline.probe;
      console.log(`[parity] ${viewport.name}: universal…`);
      const universal = await shotUniversal(browser, viewport);
      results.universal[viewport.name] = universal.probe;
      results.pixelDiff[viewport.name] = await comparePixels(browser, baseline.screenshot, universal.screenshot, viewport);
      const diff = results.pixelDiff[viewport.name];
      console.log(`[parity] ${viewport.name}: ${diff.changedPercent}% pixels differ (mean channel delta ${diff.meanChannelDelta})`);
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
