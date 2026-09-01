import { test } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp } from './_mock-api.mjs';

test('debug add provider', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await login(page);
  await page.evaluate(() => window.openSettings());
  await page.waitForSelector('#settingsOverlay:not(.hidden)');
  const info1 = await page.evaluate(() => {
    const cont = document.getElementById('providerList');
    return {
      rows: document.querySelectorAll('#providerList .provider-row').length,
      html: cont ? cont.innerHTML.slice(0, 200) : 'NO PROVIDERLIST',
      addFn: typeof window.addProvider,
      legacyAdd: !!(window.__socratesLegacy && window.__socratesLegacy.settings && typeof window.__socratesLegacy.settings.addProvider),
      providers: ((window.apiConfig && window.apiConfig.providers) || []).map((p) => p.id),
    };
  });
  console.log('BEFORE', JSON.stringify(info1));
  await page.locator('#settingsOverlay #addProviderBtn').click();
  await page.waitForTimeout(300);
  const info2 = await page.evaluate(() => ({
    rows: document.querySelectorAll('#providerList .provider-row').length,
    providers: ((window.apiConfig && window.apiConfig.providers) || []).map((p) => p.id),
  }));
  console.log('AFTER', JSON.stringify(info2));
});
