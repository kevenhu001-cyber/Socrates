import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

// App loads -> settings/theme/form interactions -> shared shadcn controls and
// retained shell surfaces stay readable, responsive, and on the same palette.
for (const style of ['socrates', 'philosophy']) {
  for (const mode of ['light', 'dark']) {
    test(`${style} ${mode}: theme reaches native shell and shadcn controls`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.emulateMedia({ colorScheme: mode });
      await mockAuthedApp(page);
      await page.addInitScript(
        ({ style, mode }) => {
          localStorage.setItem('socrates-theme-style', style);
          localStorage.setItem('socrates-theme', mode);
        },
        { style, mode },
      );
      await gotoAndSettle(page, '/');
      await waitForAppShell(page);
      await expect(page).toHaveTitle(/Socrates/i);
      await expect(page.locator('html')).toHaveAttribute('data-theme', style);
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      await page.locator('#apiSettingsBtn').click();
      const settings = page.locator('#settingsPage');
      await expect(settings).toBeVisible();
      const appearance = settings.locator('#settings-appearance');
      await expect(appearance).toHaveAttribute('data-slot', 'select-trigger');
      await expect(settings.locator('.settings-nav input')).toHaveAttribute(
        'data-slot',
        'input-group-control',
      );
      await expect(settings.getByRole('button', { name: 'Back', exact: true })).toHaveAttribute(
        'data-slot',
        'button',
      );
      const aliases = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        return [
          ['--background', '--ui-bg-page'],
          ['--foreground', '--ui-text-primary'],
          ['--primary', '--ui-accent-strong'],
          ['--border', '--ui-border-default'],
          ['--sidebar', '--ui-bg-sidebar'],
          ['--popover', '--ui-bg-overlay'],
        ].map(([semantic, legacy]) => [
          css.getPropertyValue(semantic).trim(),
          css.getPropertyValue(legacy).trim(),
        ]);
      });
      for (const [semantic, legacy] of aliases) {
        expect(semantic).not.toBe('');
        expect(semantic).toBe(legacy);
      }
      await settings.locator('.settings-nav [data-section="personalization"]').click();
      const section = settings.locator('.settings-pane:visible .settings-section').first();
      await expect(section).toBeVisible();
      expect(
        await section.evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft)),
      ).toBeGreaterThan(0);
      const tones = settings.locator('#tonePresetOptions');
      await expect(tones.getByRole('button').first()).toHaveCSS('border-width', '1px');
      await expect(tones.getByRole('button', { pressed: true })).not.toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      );
      await expect(settings.locator('.settings-nav [aria-current="page"]')).not.toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      );
      const contentWidth = await section.evaluate((node) => {
        const style = getComputedStyle(node);
        return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      });
      expect((await tones.boundingBox()).width).toBeCloseTo(contentWidth, 0);
      const instructions = settings.locator('#settings-custom-instructions');
      await instructions.fill('A shared theme must preserve editable form state.');
      await expect(instructions).toHaveValue('A shared theme must preserve editable form state.');
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `test-results/shadcn-settings-${encodeURIComponent(style)}-${encodeURIComponent(mode)}.png`,
        fullPage: false,
      });
      await page.keyboard.press('Escape');
      await expect(settings).toBeHidden();
      await expect(page.locator('#apiSettingsBtn')).toBeFocused();
      expect(errors).toEqual([]);
    });
  }
}

test('display options support keyboard navigation and switches persist on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const settings = page.locator('#settingsPage');
  await settings.locator('.settings-nav [data-section="display"]').click();
  const options = settings.locator('[data-slot="toggle-group"]').first().getByRole('button');
  await options.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(options.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(options.nth(2)).toHaveAttribute('aria-pressed', 'true');
  const grid = settings.getByRole('switch');
  const before = await grid.isChecked();
  await grid.click();
  await expect(grid).toBeChecked({ checked: !before });
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('socrates-display')).font))
    .toBe(1.25);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/shadcn-settings-mobile.png', fullPage: false });
});
