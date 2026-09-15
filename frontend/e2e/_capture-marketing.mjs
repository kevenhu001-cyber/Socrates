// e2e/_capture-marketing.mjs — capture REAL app UI for the marketing site.
// Serves dist/, boots the app with the shared /api mocks, loads a crafted
// session, and writes PNG screenshots to ../site/media/real/ (convert to
// .webp with cwebp afterwards).
//
// Usage:  node e2e/_capture-marketing.mjs            (uses existing dist/)
// Output: site/media/real/*.png

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../../site/media/real');
const PORT = 4199;
const BASE = `http://127.0.0.1:${PORT}`;

const SESSION_ID = '33333333-3333-4333-8333-333333333333';

const VIZ_SPEC = {
  version: 1,
  template: 'function',
  title: 'Secant → tangent',
  caption: 'Drag h toward zero — the secant settles onto the tangent.',
  accessibilitySummary: 'Parabola y equals x squared with a secant line and the tangent line at x equals one.',
  payload: {
    functions: [
      { expression: 'x^2', label: 'y = x²' },
      { expression: '3.5*x-2.5', label: 'secant · h = 1.5' },
      { expression: '2*x-1', label: 'tangent · x = 1' },
    ],
    xLabel: 'x',
    yLabel: 'y',
  },
};

const KB_NODES = [
  { name: 'limits', status: 'internalized', questions: 9, confidence_score: 5 },
  { name: 'rate of change', status: 'internalized', questions: 6, confidence_score: 4 },
  { name: 'secant slope', status: 'fuzzy', questions: 4, confidence_score: 2 },
  { name: 'derivatives', status: 'fuzzy', questions: 3, confidence_score: 2 },
  { name: 'chain rule', status: 'blank', questions: 1, confidence_score: 1 },
  { name: 'integrals', status: 'blank', questions: 0, confidence_score: 0 },
];

const SESSION = {
  id: SESSION_ID,
  topic: 'Calculus',
  title: 'Secant vs tangent',
  domain: 'math',
  mode: 'chat',
  kind: 'chat',
  phase: 'chat',
  messages: [
    {
      id: 'm-u1',
      role: 'user',
      rawText: 'I keep mixing up the secant slope and the tangent slope — what actually changes as h → 0?',
      html: '<p>I keep mixing up the secant slope and the tangent slope — what actually changes as h → 0?</p>',
    },
    {
      id: 'm-a1',
      role: 'assistant',
      rawText: [
        '<definition><term>Secant line</term><body>A line through two points of a curve. Its slope is the average rate of change between them.</body></definition>',
        '',
        'Before the formula — picture the two points sliding toward each other. What does the line through them become?',
        '',
        '$$m_{\\text{sec}} = \\frac{f(x+h) - f(x)}{h}$$',
        '',
        'I plotted it below. Watch the secant settle onto the tangent as h shrinks — then tell me: what stays true about the slope at exactly x = 1?',
      ].join('\n'),
      html: '<p>snapshot</p>',
      toolCalls: [{
        id: 'tc-viz',
        name: 'render_visualization',
        input: VIZ_SPEC,
        output: 'Visualization ready',
        artifacts: [],
      }],
    },
    {
      id: 'm-u2',
      role: 'user',
      rawText: 'It becomes the tangent — a line that only touches the curve at that one point?',
      html: '<p>It becomes the tangent — a line that only touches the curve at that one point?</p>',
    },
    {
      id: 'm-a2',
      role: 'assistant',
      rawText: 'Almost — “touches at one point” is close, but a tangent can cross the curve elsewhere. The real claim is about *direction*: the tangent matches the curve’s slope at that point. So in your own words — what would have to be true about $f\'(1)$ for that line to be the tangent?',
      html: '<p>snapshot</p>',
    },
  ],
  kbNodes: KB_NODES,
  mistakes: [],
};

const SIDEBAR_SESSIONS = [
  { id: SESSION_ID, title: 'Secant vs tangent', topic: 'Calculus', mode: 'chat', kind: 'chat', updatedAt: new Date().toISOString() },
  { id: 's-2', title: 'Why limits come first', topic: 'Calculus', mode: 'chat', kind: 'chat', updatedAt: new Date(Date.now() - 864e5).toISOString() },
  { id: 's-3', title: 'Chain rule intuition', topic: 'Calculus', mode: 'chat', kind: 'chat', updatedAt: new Date(Date.now() - 2 * 864e5).toISOString() },
];

async function settle(page, url) {
  await page.goto(url, { waitUntil: 'commit', timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => typeof window.loadSession === 'function', null, { timeout: 30000 }).catch(() => {});
  await waitForAppShell(page);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = spawn('node', [resolve(__dirname, 'dist-server.mjs')], {
    env: { ...process.env, SMOKE_PORT: String(PORT) },
    stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 1200));

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
    await mockAuthedApp(page);

    // Session detail + a populated recents list for the sidebar.
    await page.route(new RegExp('/api/(?:v2/)?sessions/' + SESSION_ID + '(?:\\?.*)?$'), (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION) }));
    await page.route(new RegExp('/api/(?:v2/)?sessions(?:\\?.*)?$'), (route) => {
      if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { id: 'smoke-saved-1' } }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: SIDEBAR_SESSIONS }) });
    });

    await settle(page, BASE + '/');
    await page.evaluate((id) => window.loadSession(id), SESSION_ID);
    await page.waitForSelector('.visualization-card svg, .visualization-card canvas, .visualization-card .js-plotly-plot', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(4000);
    // Center the visualization card so the shot shows the full chart surface.
    await page.evaluate(() => {
      const card = document.querySelector('.visualization-card');
      if (card) card.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: resolve(OUT_DIR, 'app-chat.png') });
    console.log('captured app-chat.png');

    // Knowledge map — force the tutor-only panel visible like kb-graph.spec.
    await page.evaluate(({ nodes }) => {
      window.stateStore.dispatch({ type: 'state/set', key: 'kbNodes', value: nodes });
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('collapsed');
      const panel = document.getElementById('knowledgePanel');
      if (panel) {
        panel.classList.remove('hidden');
        panel.style.setProperty('display', 'flex', 'important');
      }
      const recents = document.getElementById('recentsPanel');
      if (recents) recents.classList.add('hidden');
      window.tutorSocratic.renderKnowledgeBoundaryFile({ immediate: true });
    }, { nodes: KB_NODES });
    await page.waitForSelector('#kbContent svg.kb-graph .kb-graph-node', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(OUT_DIR, 'app-map.png') });
    console.log('captured app-map.png');

    // Exam panel — the real generation form (topic/difficulty/count pickers).
    const opened = await page.evaluate(() => {
      try { window.openExamPanel && window.openExamPanel(); return true; } catch (e) { return false; }
    });
    if (opened) {
      await page.waitForTimeout(1200);
      await page.screenshot({ path: resolve(OUT_DIR, 'app-exam.png') });
      console.log('captured app-exam.png');
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log('done →', OUT_DIR);
}

main().catch((e) => { console.error(e); process.exit(1); });
