// Legacy coverage for the search-progress component. The live chat
// path no longer mounts a search-progress card (the model announces
// what it is doing via the inline thinking-status label), but the
// module is still exported by ui/searchProgress.js for any future
// consumer and the `window.__startSearchProgress` test hook is kept
// stable so this regression suite still exercises the component's
// step / finalize / elapsed-time behaviour.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('pre-search ranks Chinese snippets without fetching every result page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('socrates-websearch', 'true'));
  await mockAuthedApp(page);
  let batchCalls = 0;
  await page.route('**/api/**/fetch-batch', async (route) => {
    batchCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
  });
  await page.route('**/api/**/web-search', async (route) => {
    const english = route.request().postDataJSON().query === 'Python release date';
    const results = english
      ? [
          { title: 'Other subject', url: 'https://example.test/other', snippet: 'Unrelated material' },
          { title: 'Release notes', url: 'https://example.test/python', snippet: 'Python release date ' + 'x'.repeat(1000) },
        ]
      : [
          { title: 'Other subject', url: 'https://example.test/other', snippet: 'Unrelated material' },
          { title: '最新版本发布', url: 'https://example.test/release', snippet: '最新版本发布的日期及说明', date: '2026-09-01', source: 'bing' },
        ];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results }) });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  const result = await page.evaluate(() => window.fetchWebContext('最新版本发布', { queries: ['最新版本发布'] }));
  expect(result.ok).toBe(true);
  expect(result.sources.map((source) => source.url)).toEqual(['https://example.test/release']);
  expect(result.context).toContain('最新版本发布的日期及说明');
  expect(result.context).not.toContain('Full text:');
  expect(result.context).toContain('Markdown link');
  const snippetMatch = await page.evaluate(() => window.fetchWebContext('Python release date', { queries: ['Python release date'] }));
  expect(snippetMatch.sources.map((source) => source.url)).toEqual(['https://example.test/python']);
  expect(snippetMatch.sources[0]._relevance).toBeGreaterThanOrEqual(30);
  expect(snippetMatch.context).not.toContain('x'.repeat(600));
  expect(batchCalls).toBe(0);
});

test('deep research fetches only selected pages after searching', async ({ page }) => {
  await mockAuthedApp(page);
  let batchCalls = 0;
  await page.route('**/api/**/fetch-batch', async (route) => {
    batchCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [
      { ok: true, url: 'https://example.test/research', title: 'Research source', content: 'EXTRACTED_PAGE_SENTINEL primary source evidence' },
    ] }) });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  const report = await page.evaluate(async () => {
    window.getActiveProvider = () => null;
    window.fetchWebContext = async () => ({ ok: true, sources: [
      { url: 'https://example.test/research', title: 'Research source', snippet: 'search snippet' },
    ] });
    return window.startDeepResearch('Research a topic');
  });
  expect(batchCalls).toBe(1);
  expect(report).toContain('EXTRACTED_PAGE_SENTINEL');
});

test('search progress exposes elapsed time and keyboard-accessible details', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.evaluate(async () => {
    const mount = document.createElement('div');
    mount.id = 'search-progress-test-mount';
    document.body.appendChild(mount);
    window.__searchProgressTest = window.__startSearchProgress('Socratic learning', { mount });
    window.__searchProgressTest.onStep({ kind: 'querying', data: { query: 'Socratic learning evidence' } });
    window.__searchProgressTest.onStep({ kind: 'got_results', data: { count: 4 } });
  });

  const root = page.locator('#search-progress-test-mount .search-progress');
  const head = root.locator('.search-progress-head');
  await expect(root).toHaveAttribute('aria-busy', 'true');
  await expect(head).toHaveAttribute('role', 'button');
  await head.focus();
  await page.keyboard.press('Enter');
  await expect(root).toHaveClass(/open/);
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(root.locator('.search-progress-step')).toHaveCount(2);

  await page.waitForTimeout(1100);
  await expect(root.locator('.search-progress-elapsed')).not.toHaveText('0s');
  await page.evaluate(() => {
    window.__searchProgressTest.finalize({
      state: 'ok',
      finalCount: 4,
      engines: { bing: 3, web: 1 },
      fetchedCount: 2,
    });
  });
  await expect(root).toHaveAttribute('aria-busy', 'false');
  await expect(root.locator('.search-progress-title')).toContainText('4 sources');
  await expect(root.locator('.search-progress-elapsed')).toHaveText(/\d+\.\d+s/);
});