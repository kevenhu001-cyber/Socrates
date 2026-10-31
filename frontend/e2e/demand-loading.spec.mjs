import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { prepareChatWorkbench } from './_chat-workbench.mjs';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp } from './_mock-api.mjs';

const report = JSON.parse(readFileSync(resolve(import.meta.dirname, '../dist/.vite/entry-graph.json'), 'utf8'));
const chunkOf = (id) => report.modules.find((module) => module.id === id).chunk;
const plain = { clientId: 'demand-plain', role: 'assistant', type: 'assistant',
  rawText: 'A plain answer with no optional content.', html: '<p>A plain answer with no optional content.</p>' };

async function flushIdle(page) {
  // Exercise all boot-time idle work immediately, without a 15-second sleep.
  await page.addInitScript(() => {
    window.requestIdleCallback = (callback) => window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0);
    window.cancelIdleCallback = window.clearTimeout.bind(window);
  });
}

for (const signedIn of [true, false]) {
  test(`${signedIn ? 'signed-in plain chat' : 'anonymous boot'} keeps optional vendors and executors unloaded after idle`, async ({ page }) => {
    await flushIdle(page);
    if (signedIn) {
      await prepareChatWorkbench(page, { messages: [plain] });
      await expect(page.locator('#msgList')).toContainText(plain.rawText);
      await expect(page.locator('#composerRoot .rich-composer-editor')).toBeVisible();
    } else {
      await mockAuthedApp(page);
      await page.route(/\/api\/v2\/auth\/me(?:\?|$)/, (route) => route.fulfill({ status: 401, json: { error: 'unauthorized' } }));
      await gotoAndSettle(page, '/');
      await expect(page.locator('#authGate')).toBeVisible();
    }
    await page.waitForLoadState('networkidle');
    const paths = await page.evaluate(() => [...new Set(performance.getEntriesByType('resource')
      .map((entry) => new URL(entry.name).pathname).filter((path) => /^\/assets\/.+\.(?:js|css)$/.test(path)))]);
    for (const id of ['src/exam.ts', 'src/chat/streamingTurn.ts', 'node_modules/fuse.js/dist/fuse.mjs']) {
      expect(paths).not.toContain('/' + chunkOf(id));
    }
    expect(paths.some((path) => /\/(?:katex|highlight)[^/]*\.(?:js|css)$/.test(path))).toBe(false);
    expect(await page.evaluate(() => ({ katex: !!window.katex, highlight: !!window.hljs, Fuse: !!window.Fuse })))
      .toEqual({ katex: false, highlight: false, Fuse: false });
    if (signedIn) {
      const metrics = { jsCssGzipBytes: paths.reduce((sum, path) => sum + gzipSync(readFileSync(resolve(import.meta.dirname, '../dist' + path))).length, 0), paths };
      writeFileSync('test-results/round2-runtime-assets.json', JSON.stringify(metrics, null, 2));
      await test.info().attach('runtime-assets', { body: JSON.stringify(metrics), contentType: 'application/json' });
    }
  });
}

test('math alone loads KaTeX and a transient failure recovers with a single repaint', async ({ page }) => {
  let attempts = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/assets/katex*.js', async (route) => {
    attempts += 1;
    if (attempts === 1) return route.abort('failed');
    await gate;
    await route.continue();
  });
  try {
    await prepareChatWorkbench(page, { messages: [{ ...plain, clientId: 'demand-math',
      rawText: 'Inline $x^2$ and display $$\\frac{1}{2}$$.', html: '<p>Math is loading.</p>' }] });
    await expect.poll(() => attempts).toBe(2);
    await expect(page.locator('#msgList .katex')).toHaveCount(0);
    release();
    await expect(page.locator('#msgList .katex')).toHaveCount(2);
    expect(await page.evaluate(() => '__socratesMathRenderRev' in window)).toBe(false);
    expect(await page.evaluate(() => '__socratesRerenderMath' in window)).toBe(false);
    expect(await page.evaluate(() => !!window.hljs)).toBe(false);
    await page.screenshot({ path: 'test-results/round2-math-ready.png' });
  } finally { release(); }
});

test('labelled code loads highlighting without KaTeX and preserves the copy source', async ({ page }) => {
  let requested = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/assets/highlight*.js', async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  const source = 'def price():\n    return "$5"';
  try {
    await prepareChatWorkbench(page, { messages: [{ ...plain, clientId: 'demand-code',
      rawText: '```python\n' + source + '\n```', html: '<p>Code is loading.</p>' }] });
    await expect.poll(() => requested).toBe(true);
    const code = page.locator('#msgList pre code');
    await expect(code).toHaveText(source);
    await expect(code.locator('.hljs-keyword')).toHaveCount(0);
    release();
    await expect(code.locator('.hljs-keyword').first()).toBeVisible();
    await expect(code).toHaveText(source);
    expect(await page.evaluate(() => !!window.katex)).toBe(false);
    await page.screenshot({ path: 'test-results/round2-code-ready.png' });
  } finally { release(); }
});

test('search replays the latest query when Fuse arrives without another server request', async ({ page }) => {
  let requested = false;
  let release;
  let searches = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route(`**/${chunkOf('node_modules/fuse.js/dist/fuse.mjs')}`, async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  try {
    await prepareChatWorkbench(page, { messages: [plain] });
    await page.route(/\/api\/(?:v2\/)?search(?:\?|$)/, (route) => {
      searches += 1;
      return route.fulfill({ json: { hits: [] } });
    });
    expect(requested).toBe(false);
    await page.evaluate(() => {
      window.SERVER_SESSIONS = [
        { id: 'calculus', title: 'Differential calculus' },
        { id: 'physics', title: 'Particle physics' },
      ];
    });
    await page.keyboard.press('Control+k');
    await expect.poll(() => requested).toBe(true);
    const input = page.locator('#cmdKInput');
    await input.fill('calculus');
    await input.fill('physics');
    await expect.poll(() => searches).toBe(2);
    await expect(page.locator('#cmdKResults .cmd-k-row')).toHaveCount(0);
    release();
    await expect(page.locator('#cmdKResults .cmd-k-row')).toHaveCount(1);
    await expect(page.locator('#cmdKResults')).toContainText('Particle physics');
    expect(searches).toBe(2);
  } finally { release(); }
});
