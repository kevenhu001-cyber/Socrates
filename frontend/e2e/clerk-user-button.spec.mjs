import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.describe('Clerk User Button', () => {
  test('clicking user row opens Clerk popover card and closes on Escape', async ({ page }) => {
    await mockAuthedApp(page);
    await gotoAndSettle(page, '/');
    await page.waitForLoadState('domcontentloaded');
    await waitForAppShell(page);

    const userRow = page.locator('#sidebarUserRow');
    await expect(userRow).toBeVisible();

    // Menu should be closed initially
    await expect(page.locator('.user-btn__open')).toHaveCount(0);

    // Click user row to open Clerk popover
    await userRow.click();
    const popover = page.locator('.user-btn__open');
    await expect(popover).toBeVisible();

    // Check large avatar, name, menu items
    await expect(popover.locator('.user-btn__avatar--large')).toBeVisible();
    await expect(popover.locator('.user-btn__name')).toBeVisible();
    await expect(popover.locator('.user-btn__menu-item')).toHaveCount(3);
    await expect(popover.locator('.user-btn__secured')).toBeVisible();

    // Press Escape to dismiss
    await page.keyboard.press('Escape');
    await expect(page.locator('.user-btn__open')).toHaveCount(0);
  });

  test('clicking Manage Account opens profile modal', async ({ page }) => {
    await mockAuthedApp(page);
    await gotoAndSettle(page, '/');
    await page.waitForLoadState('domcontentloaded');
    await waitForAppShell(page);

    const userRow = page.locator('#sidebarUserRow');
    await userRow.click();

    const manageBtn = page.locator('.user-btn__menu-item').first();
    await expect(manageBtn).toBeVisible();
    await manageBtn.click();

    // Profile overlay should be open (hidden class removed)
    await expect(page.locator('#profileOverlay')).not.toHaveClass(/hidden/);
  });
});
