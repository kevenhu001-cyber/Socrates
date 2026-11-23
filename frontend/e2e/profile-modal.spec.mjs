import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('profile page renders account, subscription, preferences, and data sections', async ({
  page,
}) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  expect(await page.evaluate(() => '_userMemories' in window)).toBe(false);
  const account = page.locator('.sidebar-account-trigger');
  await account.click();
  const menu = page.getByRole('menu', { name: 'Account' });
  await expect(menu.getByRole('menuitem', { name: 'Profile', exact: true })).toHaveCount(1);
  await menu.getByRole('menuitem', { name: 'Profile', exact: true }).click();

  const profile = page.locator('#profilePage');
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('region', { name: 'Profile', exact: true })).toBeVisible();
  await expect(profile.locator('#profileName')).toBeVisible();
  await expect(profile.locator('#profileEmail')).not.toBeEmpty();
  await expect(profile.locator('#profileJoined')).not.toBeEmpty();
  await expect(profile.locator('#profileTier')).toBeVisible();
  await expect(profile.locator('#profileLangToggle')).toBeVisible();
  const webSearchToggle = profile.getByRole('switch', { name: 'Web search' });
  await expect(webSearchToggle).toHaveAttribute('aria-checked', 'false');
  await webSearchToggle.click();
  await expect(webSearchToggle).toHaveAttribute('aria-checked', 'true');
  await expect(profile.locator('#profileInstResponse')).toBeVisible();
  await expect(profile.locator('#profileInstAbout')).toBeVisible();
  await expect(
    profile.locator('.profile-section').nth(3).locator('.profile-action-row'),
  ).toHaveCount(5);

  await profile.locator('#profileLangZh').click();
  await expect(profile.locator('#profileLangZh')).toHaveClass(/active/);
  await expect(page.getByRole('heading', { name: '个人资料', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/shadcn-profile.png' });
  await page.locator('#profileBackBtn').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#profilePage')).toBeHidden();
  await expect(account).toBeFocused();
});

test('phone profile fits a narrow viewport and keeps the account identity visible in the drawer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await mockAuthedApp(page, {
    lang: 'zh',
    user: { displayName: '手机端测试用户', email: 'a.long.profile.address@example.test' },
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#sidebarOpenBtn').click();
  const account = page.locator('.sidebar-account-trigger');
  await expect(account.locator('.user-name')).toHaveText('手机端测试用户');
  await expect(account.locator('.user-name')).toBeVisible();
  await account.click();
  await page.getByRole('menuitem', { name: '个人资料', exact: true }).click();

  const profile = page.getByRole('region', { name: '个人资料', exact: true });
  await expect(profile.locator('#profileEmail')).toHaveText('a.long.profile.address@example.test');
  await expect(profile.locator('#profileName')).toHaveValue('手机端测试用户');
  const layout = await profile.locator('.profile-page-body').evaluate((body) => ({
    client: body.clientWidth,
    scroll: body.scrollWidth,
    sections: [...body.querySelectorAll('.profile-section')].map((section) => section.offsetLeft),
  }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.client + 1);
  expect(new Set(layout.sections).size).toBe(1);
  await page.screenshot({ path: 'test-results/profile-mobile.png' });
  await profile.locator('#profileBackBtn').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#sidebarOpenBtn')).toBeVisible();
});
