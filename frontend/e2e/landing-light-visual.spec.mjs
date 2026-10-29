import { test, expect } from '@playwright/test';
import { gotoAndSettle, rgbChannels } from './_lib.mjs';
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
      composer: rect('#composerInputWrap'),
      topicFontSize: parseFloat(getComputedStyle(document.querySelector('#composerRoot .rich-composer-editor')).fontSize),
      pageBackground: rgb('.main-content'),
      sidebarBackground: rgb('#sidebar'),
      semanticPage: getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),
      semanticSidebar: getComputedStyle(document.documentElement).getPropertyValue('--sidebar').trim(),
      composerBackground: rgb('#composerInputWrap'),
      titleColor: rgb('#topicTitle', 'color'),
      titleSize: getComputedStyle(document.querySelector('#topicTitle')).fontSize,
      fontFamily: getComputedStyle(document.querySelector('#topicTitle')).fontFamily,
    };
  });
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
  /* ChatGPT.html measures 768 x 52 with a 16px editor at 1440x900. */
  expect(geometry.composer?.height).toBe(52);
  expect(geometry.topicFontSize).toBe(16);
  /* The baseline greeting is 24px / 28px / 400 (docs/ref/chatgpt-parity.md,
     captured over CDP from chatgpt.com at 1440×900). The old 30px was the
     display-heading step, not the reference's line. */
  expect(geometry.titleSize).toBe('24px');
  expect(geometry.fontFamily).toContain('Geist Sans');
  /* Current ChatGPT landing geometry leaves a 36px pause between the 24/28
     greeting and the 768×52 composer. */
  expect((geometry.composer?.top ?? 0) - (geometry.title?.bottom ?? 0)).toBeGreaterThanOrEqual(34);
  expect((geometry.composer?.top ?? 0) - (geometry.title?.bottom ?? 0)).toBeLessThanOrEqual(38);
  expect(geometry.composer?.bottom ?? 960).toBeLessThan(960 * 0.64);
  await expect(page.locator('.home-ideas, .chat-suggestions, #topicQuickActions')).toHaveCount(0);
  expect(luminance(geometry.pageBackground)).toBeGreaterThan(0.88);
  // Surfaces resolve from the active shadcn semantic roles; channel parsing
  // keeps these checks stable across rgb() and oklch() serialization.
  expect(rgbChannels(geometry.pageBackground)).toEqual(rgbChannels(geometry.semanticPage));
  expect(rgbChannels(geometry.sidebarBackground)).toEqual(rgbChannels(geometry.semanticSidebar));
  expect(luminance(geometry.sidebarBackground)).toBeLessThan(luminance(geometry.pageBackground));
  expect(luminance(geometry.composerBackground)).toBeGreaterThanOrEqual(luminance(geometry.pageBackground));
  expect(contrast(geometry.titleColor, geometry.pageBackground)).toBeGreaterThan(10);

  const editor = page.locator('#composerRoot .rich-composer-editor');
  await page.locator('#navNew').focus();
  await page.keyboard.press('Tab');
  const focusedControl = await page.evaluate(() => ({
    matchesVisible: document.activeElement?.matches(':focus-visible') ?? false,
    outlineStyle: getComputedStyle(document.activeElement).outlineStyle,
    outlineWidth: getComputedStyle(document.activeElement).outlineWidth,
  }));
  expect(focusedControl.matchesVisible).toBe(true);
  expect(focusedControl.outlineStyle).toBe('solid');
  expect(focusedControl.outlineWidth).toBe('3px');

  const beforeFocus = await page.locator('#composerInputWrap').boundingBox();
  await editor.click();
  await expect(page.locator('#composerInputWrap')).toHaveClass(/composer-focused/);
  const afterFocus = await page.locator('#composerInputWrap').boundingBox();
  expect(Math.abs((afterFocus?.y ?? 0) - (beforeFocus?.y ?? 0))).toBeLessThanOrEqual(1);
  expect(consoleErrors).toEqual([]);

  await page.screenshot({ path: 'test-results/socrates-landing-light-desktop.png', fullPage: true });

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
  await expect(page.locator('#composerInputWrap')).toBeVisible();
  await expect(page.locator('.home-ideas, .chat-suggestions, #topicQuickActions')).toHaveCount(0);
  const mobileComposer = await page.locator('#composerInputWrap').boundingBox();
  /* The empty state pins the prompt to the bottom action band: the capsule's
     bottom edge rests on the safe-area inset above the viewport foot. */
  const mobileComposerBottom = (mobileComposer?.y ?? 0) + (mobileComposer?.height ?? 0);
  expect(mobileComposerBottom).toBeGreaterThanOrEqual(844 - 24);
  expect(mobileComposerBottom).toBeLessThanOrEqual(844);
  await page.screenshot({ path: 'test-results/socrates-landing-light-mobile.png', fullPage: true });
});
