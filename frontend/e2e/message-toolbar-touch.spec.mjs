import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function seedTranscript(page) {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
    window.stateStore.dispatch({ type: 'state/batch', patch: {
      phase: 'chat', currentSessionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', messages: [],
    } });
    window.addMessage('user', 'First question.');
    window.addMessage('assistant', 'First answer.');
    window.addMessage('user', 'Second question.');
    window.addMessage('assistant', 'Second answer.');
  });
  await expect(page.locator('#msgList .msg')).toHaveCount(4);
}

for (const touch of [false, true]) {
  test.describe(touch ? 'touch transcript actions' : 'desktop transcript actions', () => {
    test.use(touch ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 800 } });

    test('only the latest message of each role has a toolbar; history opens a menu', async ({ page }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await seedTranscript(page);
      for (const role of ['user', 'assistant']) {
        const rows = page.locator(`#msgList .msg.${role}`);
        await expect(rows.first().locator('.msg-toolbar')).toHaveCount(0);
        await expect(rows.last().locator('.msg-toolbar')).toHaveCount(1);
        await expect(rows.first().getByRole('button')).not.toBeVisible();
        const body = rows.first().locator('.msg-body');
        if (touch) {
          await body.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 100 });
          await expect(page.locator('.msg-action-menu')).toBeVisible();
          await body.dispatchEvent('pointerup', { pointerType: 'touch' });
        } else await body.click({ button: 'right' });
        const menu = page.locator('.msg-action-menu');
        await expect(menu.getByRole('menuitem', { name: 'Copy', exact: true })).toBeVisible();
        await expect(menu.getByRole('menuitem', { name: 'Delete message', exact: true })).toBeVisible();
        await expect(menu.getByRole('menuitem', { name: 'Branch from here', exact: true })).toBeVisible();
        if (role === 'assistant') await page.screenshot({ path: `test-results/message-menu-${encodeURIComponent(touch ? 'mobile' : 'desktop')}.png` });
        await page.keyboard.press('Escape');
        await expect(menu).not.toBeVisible();
      }
      const olderAnswer = page.locator('#msgList .msg.assistant').first();
      await olderAnswer.locator('.msg-body').dispatchEvent('contextmenu');
      await page.locator('.msg-action-menu').getByRole('menuitem', { name: 'Delete message', exact: true }).click();
      await expect(page.locator('#msgList .msg')).toHaveCount(3);
      await expect(page.locator('#msgList .msg.assistant')).toContainText('Second answer.');
      expect(errors).toEqual([]);
      await page.screenshot({ path: `test-results/message-actions-${encodeURIComponent(touch ? 'mobile' : 'desktop')}.png` });
    });

    test('movement cancels a long press', async ({ page }) => {
      await seedTranscript(page);
      const body = page.locator('#msgList .msg').first().locator('.msg-body');
      await body.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 100 });
      await body.dispatchEvent('pointermove', { pointerType: 'touch', clientX: 100, clientY: 130 });
      await page.waitForTimeout(650);
      await expect(page.locator('.msg-action-menu')).not.toBeVisible();
    });
  });
}
