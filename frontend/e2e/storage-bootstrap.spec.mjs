import { test, gotoAndSettle } from './_lib.mjs';
import { expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('storage fallback runs before bundled consumers read blocked localStorage', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockAuthedApp(page);
  await page.addInitScript(() => {
    window.__blockedStorageReads = [];
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        /* Record the bundled asset and line that reached storage before the
           shim replaced the accessor, so a failure names the module to fix. */
        const stack = new Error().stack || '';
        const frame = /\/assets\/[^\s)]+/.exec(stack);
        window.__blockedStorageReads.push(String(frame ? frame[0] : stack.split('\n')[1] || 'unknown'));
        throw new DOMException('Storage blocked for this test', 'SecurityError');
      },
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await expect(page).toHaveTitle('Socrates');
  expect(new URL(page.url()).pathname).toBe('/');
  const storage = await page.evaluate(() => {
    localStorage.setItem('bootstrap-proof', 'ready');
    return {
      blocked: window.SOCRATES_STORAGE_BLOCKED,
      value: localStorage.getItem('bootstrap-proof'),
      bundledReads: window.__blockedStorageReads.filter((stack) => /\/assets\//.test(stack)).length,
      readSites: window.__blockedStorageReads.filter((stack) => /\/assets\//.test(stack)),
    };
  });
  /* Exactly one bundled module is allowed to read storage before the shim.
     This is the canary for main.js's import ordering: more than one means a
     new early import (or a moved `import './batchStorage.js'`) now races the
     shim, and `readSites` says which asset to fix. */
  expect(storage).toEqual({
    blocked: true,
    value: 'ready',
    bundledReads: 1,
    readSites: [expect.stringMatching(/\/assets\//)],
  });
  expect(errors).toEqual([]);
  await expect(page.locator('#composerPrimaryBtn')).toBeVisible();
});
