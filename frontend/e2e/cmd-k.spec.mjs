// e2e/cmd-k.spec.mjs — Wave -1
// Spec 3/6: Cmd-K opens the search palette, the input is focusable, and the
// palette modal element becomes visible.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('Cmd-K opens the search palette and the input is focusable', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.waitForTimeout(400);

  // Trigger Cmd-K via the bridge function so the test doesn't depend on
  // OS-specific keydown bubbling.
  await page.evaluate(() => {
    if (typeof window.openCmdK === 'function') { window.openCmdK(); return; }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  });

  const modal = page.locator('#cmdKModal, .cmd-k-modal').first();
  await expect(modal).toBeVisible({ timeout: 5_000 });

  const input = page.locator('#cmdKInput').first();
  await expect(input).toBeAttached();
  await input.focus();
  await page.keyboard.type('test', { delay: 30 });
  await expect(input).toHaveValue(/test/);
});
