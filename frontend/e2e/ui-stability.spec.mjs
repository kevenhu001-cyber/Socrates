import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const HOVER_TARGETS = [
  '#navNew',
  '#composerToolsBtn',
  '#composerPrimaryBtn',
  '#modeSegmentedTop .app-mode-toggle',
];

async function readPalette(page) {
  return page.evaluate(() => {
    const read = (selector, property) => {
      const node = document.querySelector(selector);
      return node ? getComputedStyle(node).getPropertyValue(property).trim() : null;
    };
    const button = document.querySelector('#composerToolsBtn');
    const icon = button?.querySelector('svg');
    return {
      mode: document.documentElement.dataset.mode,
      page: read('.main-content', 'background-color'),
      sidebar: read('#sidebar', 'background-color'),
      composer: read('#composerInputWrap', 'background-color'),
      iconColor: icon ? getComputedStyle(icon).color : null,
      buttonColor: button ? getComputedStyle(button).color : null,
    };
  });
}

test('light and dark surfaces keep SVG contrast and hover geometry stable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('socrates-theme', 'dark'));
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  for (const mode of ['dark', 'light']) {
    await page.evaluate((nextMode) => {
      document.documentElement.setAttribute('data-mode', nextMode);
    }, mode);
    await page.waitForTimeout(150);

    const palette = await readPalette(page);
    expect(palette.mode).toBe(mode);
    /* Page and sidebar are page-colored by contract, so in dark mode both
       are legitimately #000 (docs/ref/chatgpt-parity.md) — asserting they
       avoid pure black only encoded the old blue-tinted palette this
       document lists as the deviation to fix. The composer is the one
       surface that must still read as raised against the page. */
    expect(palette.composer).not.toBe(palette.page);
    expect(palette.composer).not.toBe('rgb(0, 0, 0)');
    expect(palette.iconColor).toBe(palette.buttonColor);

    for (const selector of HOVER_TARGETS) {
      const target = page.locator(selector).first();
      if (await target.count() === 0) continue;
      const before = await target.boundingBox();
      await target.hover();
      await page.waitForTimeout(120);
      const after = await target.boundingBox();
      expect(before).not.toBeNull();
      expect(after).not.toBeNull();
      expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(0.5);
      expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(0.5);
      expect(Math.abs((after?.width ?? 0) - (before?.width ?? 0))).toBeLessThanOrEqual(0.5);
      expect(Math.abs((after?.height ?? 0) - (before?.height ?? 0))).toBeLessThanOrEqual(0.5);
    }
  }

  await page.screenshot({ path: 'test-results/socrates-ui-stability-light.png', fullPage: false });
});
