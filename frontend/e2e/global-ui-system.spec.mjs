import { expect, test } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { gotoAndSettle } from './_lib.mjs';

async function openApp(page, theme = 'light', width = 1440) {
  await page.setViewportSize({ width, height: width < 769 ? 844 : 900 });
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript((value) => localStorage.setItem('socrates-theme', value), theme);
  await mockAuthedApp(page, { lang: 'zh' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => document.fonts.ready);
}

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`shared typography and surface hierarchy (${theme}, ${width})`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
      await openApp(page, theme, width);
      await expect(page).toHaveTitle(/Socrates/);
      await expect(page.locator('#topicTitle')).toBeVisible();
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      const fonts = await page.evaluate(() => ({
        ui: getComputedStyle(document.body).fontSize,
        family: getComputedStyle(document.querySelector('#topicTitle')).fontFamily,
        resources: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('.woff2')).map((entry) => ({ name: entry.name, bytes: entry.decodedBodySize })),
      }));
      expect(fonts.ui).toBe('14px');
      expect(fonts.family).toContain('Geist Sans');
      expect(fonts.family).toContain('Noto Sans SC');
      expect(fonts.resources.some((entry) => /noto-sans-sc-\d+-/.test(entry.name))).toBe(true);
      expect(fonts.resources.some((entry) => entry.name.includes('chinese-simplified'))).toBe(false);
      expect(fonts.resources.reduce((sum, entry) => sum + entry.bytes, 0)).toBeLessThan(2_000_000);
      await page.screenshot({ path: `test-results/global-home-${encodeURIComponent(theme)}-${encodeURIComponent(width)}.png` });

      await page.evaluate(() => window.openSettings());
      const settings = page.locator('#settingsOverlay');
      await expect(settings).toBeVisible();
      await expect(settings.locator('.settings-nav button').first()).toHaveCSS('font-size', '14px');
      await expect(settings.locator('#settings-appearance')).toHaveCSS('font-size', '14px');
      expect(await settings.evaluate((node) => Number(getComputedStyle(node).zIndex))).toBeGreaterThan(200);
      const appearance = settings.locator('#settings-appearance');
      await appearance.click();
      await page.getByRole('option', { name: theme === 'light' ? '深色' : '浅色', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-mode', theme === 'light' ? 'dark' : 'light');
      await appearance.click();
      await page.getByRole('option', { name: theme === 'light' ? '浅色' : '深色', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-mode', theme);
      await page.screenshot({ path: `test-results/global-settings-${encodeURIComponent(theme)}-${encodeURIComponent(width)}.png` });
      await page.keyboard.press('Escape');
      await expect(settings).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }
}

test('a long model name does not overlap mode controls when the sidebar narrows the header', async ({ page }) => {
  await openApp(page, 'light', 1010);
  await page.locator('#topModelSwitcher .top-model-switcher-model').evaluate((node) => { node.textContent = 'A model with a deliberately long name for comparison'; });
  for (const width of [1010, 820]) {
    await page.setViewportSize({ width, height: 900 });
    const model = page.locator('#topModelSwitcher');
    const modes = page.locator('#topModeSwitch');
    const [left, right] = await Promise.all([model.boundingBox(), modes.boundingBox()]);
    expect(left.x + left.width).toBeLessThanOrEqual(right.x);
    const bar = await page.locator('.top-bar').boundingBox();
    expect(Math.abs(right.x + right.width / 2 - (bar.x + bar.width / 2))).toBeLessThanOrEqual(1);
    await model.click();
    await expect(page.locator('.chat-config-pop')).toBeInViewport();
    await page.keyboard.press('Escape');
  }
  await page.screenshot({ path: 'test-results/global-narrow-header.png' });
});

test('desktop directories share a title scale while their controls remain aligned', async ({ page }) => {
  await openApp(page);
  for (const [nav, heading] of [
    ['#navLibrary', '.library-head-left h1'],
    ['#navProjects', '.projects-directory h1'],
    ['#navScheduled', '.scheduled-directory h1'],
  ]) {
    await page.locator(nav).click();
    await expect(page.locator(heading)).toBeVisible();
    await expect(page.locator(heading)).toHaveCSS('font-size', '24px');
  }
  await page.screenshot({ path: 'test-results/global-directory.png' });
});
