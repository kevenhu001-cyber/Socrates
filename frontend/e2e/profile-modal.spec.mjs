import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('profile modal renders account, subscription, preferences, and data sections', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => window.openProfile());

  const profile = page.locator('.profile-modal');
  await expect(profile).toBeVisible();
  await expect(profile.locator('#profileName')).toBeVisible();
  await expect(profile.locator('#profileEmail')).not.toBeEmpty();
  await expect(profile.locator('#profileJoined')).not.toBeEmpty();
  await expect(profile.locator('#profileTier')).toBeVisible();
  await expect(profile.locator('#profileLangToggle')).toBeVisible();
  const webSearchToggle = profile.locator('#profileWebSearchToggle');
  await expect(webSearchToggle).toHaveAttribute('aria-pressed', 'false');
  await webSearchToggle.click();
  await expect(webSearchToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(profile.locator('#profileInstResponse')).toBeVisible();
  await expect(profile.locator('#profileInstAbout')).toBeVisible();
  await expect(profile.locator('.profile-section').nth(3).locator('.profile-action-row')).toHaveCount(5);

  await profile.locator('#profileLangZh').click();
  await expect(profile.locator('#profileLangZh')).toHaveClass(/active/);
  await profile.locator('.profile-actions button').click();
  await expect(profile).toBeHidden();
});
