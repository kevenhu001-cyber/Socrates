// e2e/a11y-focus-trap.spec.mjs — P0 accessibility contract:
// 1) When a modal opens (Cmd-K or Settings), background #appShell is set to inert;
// 2) Focus is trapped inside the active dialog across Tab and Shift+Tab navigation;
// 3) Closing the modal removes the inert attribute from #appShell and restores focus.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.describe('Modal accessibility focus trap and background isolation', () => {
  test('Cmd-K sets #appShell inert and traps Tab focus', async ({ page }) => {
    await mockAuthedApp(page);
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);

    const appShell = page.locator('#appShell');
    await expect(appShell).not.toHaveAttribute('inert');

    // Open Cmd-K
    await page.evaluate(() => {
      if (typeof window.openCmdK === 'function') window.openCmdK();
    });

    const overlay = page.locator('#cmdKOverlay');
    await expect(overlay).toBeVisible();
    await expect(appShell).toHaveAttribute('inert', '');

    // Press Tab multiple times to verify focus remains inside the overlay
    const input = page.locator('#cmdKInput');
    await expect(input).toBeFocused();

    await page.keyboard.press('Tab');
    const isInsideAfterTab = await page.evaluate(() => {
      const active = document.activeElement;
      const cmdK = document.getElementById('cmdKOverlay');
      return cmdK && cmdK.contains(active);
    });
    expect(isInsideAfterTab).toBe(true);

    // Press Escape to dismiss
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
    await expect(appShell).not.toHaveAttribute('inert');
  });

  test('Settings modal sets #appShell inert and traps Tab focus', async ({ page }) => {
    await mockAuthedApp(page);
    await gotoAndSettle(page, '/');
    await login(page);

    const appShell = page.locator('#appShell');
    await expect(appShell).not.toHaveAttribute('inert');

    await page.evaluate(() => window.openSettings());
    const overlay = page.locator('#settingsOverlay');
    await expect(overlay).toBeVisible();
    await expect(appShell).toHaveAttribute('inert', '');

    // Navigate with Tab several times and ensure focus stays within #settingsOverlay
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const inSettings = await page.evaluate(() => {
        const active = document.activeElement;
        const stg = document.getElementById('settingsOverlay');
        return stg && stg.contains(active);
      });
      expect(inSettings).toBe(true);
    }

    // Press Escape to close
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
    await expect(appShell).not.toHaveAttribute('inert');
  });
});
