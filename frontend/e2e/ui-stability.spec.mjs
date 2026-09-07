import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const HOVER_TARGETS = [
  '#navNew',
  '#topicComposerToolsBtn',
  '#startBtn',
  '#modeSegmentedTop .app-mode-toggle',
];

async function readPalette(page) {
  return page.evaluate(() => {
    const read = (selector, property) => {
      const node = document.querySelector(selector);
      return node ? getComputedStyle(node).getPropertyValue(property).trim() : null;
    };
    const button = document.querySelector('#topicComposerToolsBtn');
    const icon = button?.querySelector('svg');
    return {
      mode: document.documentElement.dataset.mode,
      page: read('.main-content', 'background-color'),
      sidebar: read('#sidebar', 'background-color'),
      composer: read('#topicInputWrap', 'background-color'),
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
    if (mode === 'dark') {
      expect(palette.page).toBe('rgb(0, 0, 0)');
      expect(palette.sidebar).toBe('rgb(0, 0, 0)');
      expect(palette.composer).toBe('rgb(33, 33, 33)');
    } else {
      expect(palette.page).not.toBe('rgb(0, 0, 0)');
      expect(palette.sidebar).not.toBe('rgb(0, 0, 0)');
      expect(palette.composer).not.toBe('rgb(0, 0, 0)');
    }
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

  await page.screenshot({ path: '/tmp/socrates-ui-stability-light.png', fullPage: false });
});
