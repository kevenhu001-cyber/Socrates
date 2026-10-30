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

// Durable Deep Research submission and recovery are covered in research-jobs.spec.mjs.
