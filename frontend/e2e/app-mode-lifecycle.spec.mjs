import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('mode change keeps an active session on cancel and resets only after confirmation', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'topic', value: 'Mode-switch test session' });
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
  });

  const cancelledSwitch = page.evaluate(() => window.toggleAppMode('tutor'));
  await expect(page.locator('#confirmDialog')).toBeVisible();
  await page.locator('#confirmCancelBtn').click();
  await cancelledSwitch;
  expect(await page.evaluate(() => window.appMode)).toBe('chat');
  expect(await page.evaluate(() => window.stateStore.read('topic'))).toBe('Mode-switch test session');

  const confirmedSwitch = page.evaluate(() => window.toggleAppMode('tutor'));
  await expect(page.locator('#confirmDialog')).toBeVisible();
  await page.locator('#confirmOkBtn').click();
  await confirmedSwitch;
  expect(await page.evaluate(() => window.appMode)).toBe('tutor');
  expect(await page.evaluate(() => window.stateStore.read('topic'))).toBe('');
});
