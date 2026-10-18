import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp } from './_mock-api.mjs';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

test('ordinary prose defers rich UI; slow renderer loading preserves prose and latest tool data', async ({ page }) => {
  const report = JSON.parse(readFileSync(resolve(import.meta.dirname, '../dist/.vite/entry-graph.json'), 'utf8'));
  const renderer = report.modules.find((item) => item.id === 'src/react/intelligence-ui/IntelligenceUiNodes.tsx');
  let requested = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route(`**/${renderer.chunk}`, async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  try {
    await prepareChatWorkbench(page, { messages: [{
      clientId: 'lazy-ui-prose', role: 'assistant', type: 'assistant',
      rawText: 'The explanation stays readable.', html: '<p>The explanation stays readable.</p>',
    }] });
    await expect(page.locator('#msgList')).toContainText('The explanation stays readable.');
    await expect(page.locator('#composerInputWrap .tiptap')).toBeVisible();
    expect(requested).toBe(false);

    const updateUi = (value) => page.evaluate((value) => {
      const prose = window.stateStore.read('messages')[0];
      window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [prose, {
        clientId: 'lazy-ui-tool', role: 'assistant', type: 'assistant', rawText: '', html: '',
        toolCalls: [{ id: 'lazy-ui-call', name: 'render_intelligent_ui', status: 'completed', textOffset: 0, output: '',
          input: { version: 1, nodes: [{ id: 'lazy-metric', type: 'metric', label: 'Latest estimate', value }] },
        }],
      }] });
      window.__socratesReactChatBridge.publish({ type: 'state-synced', reason: 'lazy-ui-fixture' });
    }, value);
    await updateUi(42);
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator('.intui[role="status"]')).toBeVisible();
    await expect(page.locator('#msgList')).toContainText('The explanation stays readable.');
    await page.screenshot({ path: 'test-results/entry-lazy-ui-loading.png' });
    await updateUi(99);
    release();
    await expect(page.locator('.intui-metric')).toContainText('Latest estimate');
    await expect(page.locator('.intui-metric')).toContainText('99');
    await expect(page.locator('.intui[role="status"]')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/entry-lazy-ui-ready.png' });
  } finally {
    release();
  }
});

test('production entry keeps the static closure gzip transfer under budget', () => {
  const dist = resolve(import.meta.dirname, '..', 'dist');
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
  const report = JSON.parse(readFileSync(resolve(dist, '.vite/entry-graph.json'), 'utf8'));
  const chunks = new Map(report.chunks.map((chunk) => [chunk.file, chunk]));
  // Recompute the closure from the HTML instead of trusting eager flags.
  const scripts = new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+\.js)"/g)].map((match) => match[1]));
  for (const file of scripts) {
    expect(chunks.has(file), `missing graph for ${file}`).toBe(true);
    for (const dependency of chunks.get(file).imports) scripts.add(dependency);
  }
  const styles = new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+\.css)"/g)].map((match) => match[1]));
  const sum = (files) => [...files].reduce((total, file) => total + gzipSync(readFileSync(resolve(dist, file))).length, 0);
  const metrics = {
    htmlGzipBytes: gzipSync(Buffer.from(html)).length,
    staticJsGzipBytes: sum(scripts),
    linkedCssGzipBytes: sum(styles),
  };
  expect(metrics).toEqual(report.metrics);
  expect(metrics.htmlGzipBytes).toBeLessThan(19_000);
  expect(metrics.staticJsGzipBytes).toBeLessThan(360_000);
  expect(metrics.linkedCssGzipBytes).toBeLessThan(210_000);
  expect(Object.values(metrics).reduce((sum, bytes) => sum + bytes, 0)).toBeLessThan(588_000);

  const lazyOnly = [
    'src/react/intelligence-ui/IntelligenceUiNodes.tsx',
    'src/react/extensions/WorkflowLayer.tsx',
    'src/react/find-in-session/FindInSession.tsx',
    'src/chat/streamAttempt.js',
    'src/ui/share.impl.mjs',
    'src/ui/cheatsheet.impl.mjs',
    'src/ui/storage.impl.mjs',
    'src/ui/promptTemplates.impl.mjs',
  ];
  for (const id of lazyOnly) {
    const module = report.modules.find((item) => item.id === id);
    expect(module, `retained lazy module ${id}`).toBeTruthy();
    expect(scripts.has(module.chunk), `${id} leaked into static closure`).toBe(false);
  }
  expect([...scripts].some((file) => /vendor-(?:editor|tldraw|three)-/.test(file))).toBe(false);
});

test('settings and workspace code load only when opened', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await login(page);

  const loadedScripts = () => page.evaluate(() => performance.getEntriesByType('resource')
    .map((entry) => new URL(entry.name).pathname).filter((path) => path.endsWith('.js')));
  const newlyLoadedScripts = (before, after) => after.some((path) => !before.includes(path));
  const initial = await loadedScripts();

  await page.evaluate(() => window.openSettings());
  await expect(page.locator('#settingsOverlay')).toBeVisible();
  const afterSettings = await loadedScripts();
  expect(newlyLoadedScripts(initial, afterSettings)).toBe(true);

  await page.evaluate(() => window.closeSettings());
  await page.click('#navLibrary');
  await expect(page.locator('#libraryPanel')).not.toHaveAttribute('aria-busy', 'true');
  const afterWorkspace = await loadedScripts();
  expect(newlyLoadedScripts(afterSettings, afterWorkspace)).toBe(true);
});

test('anonymous boot checks the session once', async ({ page }) => {
  await mockAuthedApp(page);
  let sessionChecks = 0;
  await page.route(/\/api\/v2\/auth\/me(?:\?|$)/, (route) => {
    sessionChecks += 1;
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' });
  });
  await gotoAndSettle(page, '/');
  await expect(page.locator('#authGate')).toBeVisible();
  expect(sessionChecks).toBe(1);
});

test('session check starts before slow config finishes', async ({ page }) => {
  await mockAuthedApp(page);
  let configFinished = false;
  let sessionStartedEarly = false;
  await page.route(/\/api\/v2\/config(?:\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    configFinished = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"hasBeagleKey":true}' });
  });
  await page.route(/\/api\/v2\/auth\/me(?:\?|$)/, (route) => {
    sessionStartedEarly = !configFinished;
    return route.fallback();
  });
  await gotoAndSettle(page, '/');
  await expect(page.locator('#authGate')).toBeHidden();
  expect(sessionStartedEarly).toBe(true);
});
