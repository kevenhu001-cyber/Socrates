import { test, expect } from '@playwright/test';
import { getKeyboardInset } from '../src/ui/keyboardViewport.js';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('normalizes virtual-keyboard measurements without double-counting layout resize', () => {
  // Overlay keyboard (Chrome, Safari): the layout viewport stays full height.
  expect(getKeyboardInset(844, 510, 0)).toBe(334);
  // Resizing keyboard mode (Firefox/Android): CSS dvh already moved the app.
  expect(getKeyboardInset(510, 510, 0)).toBe(0);
  // Panned Visual Viewport: offsetTop must reduce the calculated inset.
  expect(getKeyboardInset(844, 560, 24)).toBe(260);
  expect(getKeyboardInset(844, undefined)).toBe(0);
});

test('composer and message reserve follow the normalized keyboard inset on mobile', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.state.phase = 'chat';
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
  });

  const composer = page.locator('#chatInputBar');
  const messages = page.locator('#msgList');
  const before = await composer.boundingBox();
  expect(before).not.toBeNull();

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--keyboard-inset', '300px');
  });

  const after = await composer.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.round(before.y - after.y)).toBe(300);
  await expect(messages).toHaveCSS('padding-bottom', /4[0-9]{2}px/);
  expect(after.y + after.height).toBeLessThanOrEqual(544);
});
