import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function enterChat(page) {
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
  });
}

test('mobile composer groups tools, filters actions, and reflects active search', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await enterChat(page);

  const menu = page.locator('#composerToolsMenu');
  await page.locator('#chatComposerToolsBtn').click();
  await expect(menu).toBeVisible();
  await expect(menu.locator('.composer-tools-mobile-items .composer-tools-group-label').first())
    .toContainText(/Add context|添加资料/);
  await expect(menu.locator('.composer-tools-mobile-items [data-composer-action="webSearch"]')).toBeVisible();

  const search = menu.locator('.composer-tools-footer-search input');
  await expect(search).toBeVisible();
  await search.fill('write');
  await expect(menu.locator('.composer-tools-mobile-items [data-composer-action="write"]')).toBeVisible();
  await expect(menu.locator('.composer-tools-mobile-items [data-composer-action="webSearch"]')).toHaveCount(0);

  await search.fill('');
  await menu.locator('.composer-tools-mobile-items [data-composer-action="webSearch"]').click();
  await expect(menu).toHaveClass(/hidden/);

  await page.locator('#chatComposerToolsBtn').click();
  await expect(menu.locator('.composer-tools-mobile-items [data-composer-action="webSearch"]'))
    .toHaveAttribute('aria-pressed', 'true');
  await expect(menu.locator('.composer-tools-mobile-items [data-composer-action="webSearch"] .composer-tools-active-dot'))
    .toBeVisible();
  await menu.screenshot({ path: 'test-results/visual-qa/mobile-composer-tools.png' });

  await page.keyboard.press('Escape');
  await expect(menu).toHaveClass(/hidden/);
  await expect(page.locator('#chatComposerToolsBtn')).toBeFocused();
});

test('mobile plugin status explains the empty state and opens the connector directory', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await enterChat(page);
  await page.locator('#chatComposerToolsBtn').click();

  const menu = page.locator('#composerToolsMenu');
  await expect(menu.locator('.composer-tools-plugin-state'))
    .toContainText(/No connected apps yet|还没有已连接应用/);
  await menu.getByRole('menuitem', { name: /Manage apps|管理应用/ }).click();
  await expect(page.locator('#pluginsPanel')).toBeVisible();
  await expect(menu).toHaveClass(/hidden/);
});
