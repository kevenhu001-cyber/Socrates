import { test, expect } from './_state-fixture.mjs';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function enterChat(page) {
  await page.evaluate(() => {
    window.__socratesTestState.patch({ session: { phase: 'chat' } });
    window.__testActivateMainView('chatView');
  });
}

test('mobile composer groups tools and reflects the active tool', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await enterChat(page);

  const menu = page.locator('#composerToolsMenu');
  await page.locator('#composerToolsBtn').click();
  await expect(menu).toBeVisible();
  await expect(
    menu.locator('.composer-tools-mobile-items .composer-tools-group-label').first(),
  ).toContainText(/Add context|添加资料/);
  await expect(
    menu.locator('.composer-tools-mobile-items [data-composer-action="webSearch"]'),
  ).toBeVisible();

  /* The plus menu carries no filter field any more: every action stays on
     screen, so the roster never depends on a search box that is not there. */
  await expect(menu.locator('.composer-tools-footer-search')).toHaveCount(0);
  await expect(
    menu.locator('.composer-tools-mobile-items [data-composer-action="write"]'),
  ).toBeVisible();
  await expect(
    menu.locator('.composer-tools-mobile-items [data-composer-action="webSearch"]'),
  ).toBeVisible();

  await menu.locator('.composer-tools-mobile-items [data-composer-action="webSearch"]').click();
  await expect(menu).toHaveClass(/hidden/);

  await page.locator('#composerToolsBtn').click();
  await expect(
    menu.locator('.composer-tools-mobile-items [data-composer-action="webSearch"]'),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    menu.locator('.composer-tools-mobile-items [data-composer-action="webSearch"]'),
  ).toHaveAttribute('role', 'menuitemcheckbox');
  await expect(
    menu.locator(
      '.composer-tools-mobile-items [data-composer-action="webSearch"] .composer-tools-active-check',
    ),
  ).toBeVisible();
  await menu.screenshot({ path: 'test-results/visual-qa/mobile-composer-tools.png' });

  await page.keyboard.press('Escape');
  await expect(menu).toHaveClass(/hidden/);
  await expect(page.locator('#composerToolsBtn')).toBeFocused();
});

test('mobile Plugins shortcut opens the connector directory', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await enterChat(page);
  await page.locator('#composerToolsBtn').click();

  const menu = page.locator('#composerToolsMenu');
  const plugins = menu.getByRole('menuitem', { name: /^Plugins:/ });
  await expect(plugins).toBeVisible();
  await plugins.click();
  await expect(page.locator('#pluginsPanel')).toBeVisible();
  await expect(menu).toHaveClass(/hidden/);
});

test('phone composer hit areas reach into the visual gap without stealing adjacent taps', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  const send = page.locator('#composerPrimaryBtn');
  const editor = page.locator('#composerRoot .rich-composer-editor');
  /* The primary action is the same ink disc in every state; readiness is
     carried by opacity (0.5 disabled, 1 enabled), so the checks read that
     rather than a colour swap. */
  const idleOpacity = '0.5';
  await expect(send).toBeDisabled();
  await expect(send).toHaveCSS('opacity', idleOpacity);
  await expect(page.locator('#composerToolsBtn')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await editor.fill('A question');
  await expect(send).toBeEnabled();
  await expect(send).toHaveCSS('opacity', '1');
  const targets = await page.evaluate(() => {
    const mic = document.getElementById('composerMicBtn').getBoundingClientRect();
    const send = document.getElementById('composerPrimaryBtn').getBoundingClientRect();
    const y = send.top + send.height / 2;
    const target = (x) => document.elementFromPoint(x, y)?.closest('[data-composer-control]')?.id;
    return {
      gap: send.left - mic.right,
      mic: target(mic.right + 2),
      send: target(send.left - 2),
    };
  });
  expect(targets.gap).toBeGreaterThanOrEqual(8);
  expect(targets.mic).toBe('composerMicBtn');
  expect(targets.send).toBe('composerPrimaryBtn');
});
