import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('light conversation home has a neutral readable palette and balanced composer position', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('socrates-theme', 'light'));
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  await expect(page.locator('.sidebar-mode-switch')).toHaveCount(0);
  await expect(page.getByText('Cowork', { exact: true })).toHaveCount(0);

  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r ? { top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null;
    };
    const rgb = (selector, property = 'backgroundColor') =>
      getComputedStyle(document.querySelector(selector))[property];
    return {
      title: rect('#topicTitle'),
      composer: rect('#topicInputWrap'),
      topicFontSize: parseFloat(getComputedStyle(document.querySelector('#topicComposerRoot .rich-composer-editor')).fontSize),
      ideas: rect('.home-ideas'),
      pageBackground: rgb('.main-content'),
      sidebarBackground: rgb('#sidebar'),
      composerBackground: rgb('#topicInputWrap'),
      titleColor: rgb('#topicTitle', 'color'),
    };
  });
  const rgbChannels = (value) => (value.match(/\d+/g) ?? []).slice(0, 3).map(Number);
  const luminance = (value) => {
    const channels = rgbChannels(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrast = (foreground, background) => {
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  };

  expect(geometry.title).not.toBeNull();
  expect(geometry.composer).not.toBeNull();
  expect(geometry.composer?.height).toBe(110);
  expect(geometry.topicFontSize).toBe(18);
  expect((geometry.composer?.top ?? 0) - (geometry.title?.bottom ?? 0)).toBeGreaterThanOrEqual(18);
  expect((geometry.composer?.top ?? 0) - (geometry.title?.bottom ?? 0)).toBeLessThanOrEqual(24);
  expect(geometry.composer?.bottom ?? 960).toBeLessThan(960 * 0.64);
  expect(geometry.ideas?.top ?? 0).toBeGreaterThan(geometry.composer?.bottom ?? 0);
  expect(luminance(geometry.pageBackground)).toBeGreaterThan(0.88);
  expect(luminance(geometry.sidebarBackground)).toBeLessThan(luminance(geometry.pageBackground));
  expect(luminance(geometry.composerBackground)).toBeGreaterThanOrEqual(luminance(geometry.pageBackground));
  expect(contrast(geometry.titleColor, geometry.pageBackground)).toBeGreaterThan(10);

  const editor = page.locator('#topicComposerRoot .rich-composer-editor');
  const beforeFocus = await page.locator('#topicInputWrap').boundingBox();
  await editor.click();
  await expect(page.locator('#topicInputWrap')).toHaveClass(/composer-focused/);
  const afterFocus = await page.locator('#topicInputWrap').boundingBox();
  expect(Math.abs((afterFocus?.y ?? 0) - (beforeFocus?.y ?? 0))).toBeLessThanOrEqual(1);
  expect(consoleErrors).toEqual([]);

  await page.screenshot({ path: '/tmp/socrates-landing-light-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) window.toggleSidebar?.();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const setup = document.getElementById('topicSetup');
    if (setup) setup.scrollTop = 0;
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    const setup = document.getElementById('topicSetup');
    if (setup) setup.scrollTop = 0;
  });
  await expect(page.locator('#topicInputWrap')).toBeVisible();
  await expect(page.locator('.home-ideas')).toBeVisible();
  const mobileComposer = await page.locator('#topicInputWrap').boundingBox();
  /* The compact empty state keeps the starter rows directly above the
     bottom composer, with enough breathing room below the top bar. */
  expect(mobileComposer?.y ?? 844).toBeGreaterThan(600);
  expect(mobileComposer?.y ?? 844).toBeLessThan(820);
  const mobileIdeas = await page.locator('.home-ideas').boundingBox();
  expect(mobileIdeas?.bottom ?? 0).toBeLessThanOrEqual(mobileComposer?.y ?? 0);
  await page.screenshot({ path: '/tmp/socrates-landing-light-mobile.png', fullPage: true });
});
