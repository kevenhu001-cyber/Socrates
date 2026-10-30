import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* The transcript toolbar has one shape per input device. On a pointer device
   every row keeps its strip; on touch only the newest row does, and older
   rows collapse to a single "more actions" trigger. Five always-on buttons
   under every answer is the loudest thing on a phone, and a phone has no
   hover to defer them. */

async function seedTranscript(page) {
  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
  });
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' });
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [] });
    window.addMessage('assistant', 'First answer.');
    window.addMessage('assistant', 'Second answer.');
  });
}

const rows = (page) => page.locator('[data-client-id^="msg-"].msg.assistant');

test.describe('touch transcript toolbar', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('only the newest row keeps the full strip', async ({ page }) => {
    await mockAuthedApp(page);
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);
    await seedTranscript(page);

    await expect(rows(page)).toHaveCount(2);
    const older = rows(page).first().locator('.msg-toolbar');
    const newest = rows(page).last().locator('.msg-toolbar');

    await expect(older).toHaveAttribute('data-compact', 'true');
    await expect(older.locator('button')).toHaveCount(1);
    await expect(older.locator('button')).toHaveAttribute('aria-label', /More actions|更多操作/);

    await expect(newest).not.toHaveAttribute('data-compact', 'true');
    await expect(newest.locator("button")).toHaveCount(5);
  });

  test('the collapsed trigger still opens every action', async ({ page }) => {
    await mockAuthedApp(page);
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);
    await seedTranscript(page);

    const older = rows(page).first().locator('.msg-toolbar');
    await older.locator('button').click();

    const menu = page.locator('.msg-action-menu');
    await expect(menu).toBeVisible();
    /* The secondary actions live only behind this trigger on touch, so the
       menu has to carry them all rather than just the strip's leftovers. */
    for (const label of [/Copy|复制/, /Regenerate response|重新生成/, /Helpful|有帮助/, /Not helpful|没有帮助/, /Share conversation|分享会话/]) {
      await expect(menu.getByRole('menuitem', { name: label })).toBeVisible();
    }
  });
});

test('a pointer device keeps the strip on every row', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await seedTranscript(page);

  await expect(rows(page)).toHaveCount(2);
  for (const row of await rows(page).all()) {
    const toolbar = row.locator('.msg-toolbar');
    await expect(toolbar).not.toHaveAttribute('data-compact', 'true');
    await expect(toolbar.locator("button")).toHaveCount(5);
  }
});
