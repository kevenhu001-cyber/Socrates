import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp } from './_mock-api.mjs';

test('production entry keeps the eager gzip transfer under budget', () => {
  const dist = resolve(import.meta.dirname, '..', 'dist');
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)]
    .map((match) => match[1]);
  const bytes = assets.reduce((total, asset) => total + gzipSync(readFileSync(resolve(dist, asset))).length,
    gzipSync(Buffer.from(html)).length);
  expect(bytes).toBeLessThan(1_100_000);
});

test('settings and workspace code load only when opened', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await login(page);

  const loadedScripts = () => page.evaluate(() => performance.getEntriesByType('resource')
    .map((entry) => new URL(entry.name).pathname));
  const initial = await loadedScripts();
  expect(initial.some((path) => /SettingsModal-|WorkspacePage-/.test(path))).toBe(false);

  await page.evaluate(() => window.openSettings());
  await expect(page.locator('#settingsOverlay')).toBeVisible();
  expect((await loadedScripts()).some((path) => /SettingsModal-/.test(path))).toBe(true);

  await page.evaluate(() => window.closeSettings());
  await page.click('#navLibrary');
  await expect(page.locator('#libraryList')).not.toHaveAttribute('aria-busy', 'true');
  expect((await loadedScripts()).some((path) => /WorkspacePage-/.test(path))).toBe(true);
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
