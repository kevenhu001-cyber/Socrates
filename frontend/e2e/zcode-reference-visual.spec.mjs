import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

for (const theme of ['light', 'dark']) {
  test(`ZCode alignment surfaces: navigation, settings and providers (${theme})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockAuthedApp(page, { lang: 'en' });
    await page.addInitScript((value) => localStorage.setItem('socrates-theme', value), theme);
    await gotoAndSettle(page, '/');
    await login(page);
    await waitForAppShell(page);

    const capture = async (name) => {
      await testInfo.attach(name, {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      });
    };

    await expect(page.locator('#sidebar')).toBeVisible();
    await capture(`sidebar-1440-${theme}`);
    await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
    const settings = page.locator('#settingsPage');
    await expect(settings.locator('.settings-pane:visible h2')).toHaveText('General');
    await capture(`settings-general-1440-${theme}`);

    await settings.locator('.settings-nav [data-section="models"]').click();
    await expect(settings.locator('.settings-pane:visible h2')).toHaveText('Models & voice');
    await settings.locator('#addProviderBtn').click();
    const workbench = settings.locator('.provider-workbench');
    await expect(workbench.locator('.provider-nav-item')).not.toHaveCount(0);
    await expect(workbench.locator('.provider-editor:visible')).toHaveCount(1);
    await capture(`settings-providers-1440-${theme}`);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(workbench).toBeVisible();
    await capture(`settings-providers-390-${theme}`);
  });
}
