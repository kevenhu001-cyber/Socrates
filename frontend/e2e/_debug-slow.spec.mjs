import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('debug slow real flow', async ({ page }) => {
  const t0 = Date.now();
  await mockAuthedApp(page);
  console.log('T+mock', Date.now()-t0);
  await gotoAndSettle(page, '/');
  console.log('T+goto', Date.now()-t0);
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  console.log('T+shell', Date.now()-t0);
  await page.waitForTimeout(400);
  console.log('T+end', Date.now()-t0);
});
