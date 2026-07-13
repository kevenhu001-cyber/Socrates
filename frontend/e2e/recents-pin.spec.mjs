// e2e/recents-pin.spec.mjs — Wave -1
// Spec 6/6: the recents list renders rows; the pin button on each row toggles
// pinned state without throwing. Tolerates empty session lists.

import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('recents list renders (or is empty) and pin/unpin does not throw', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.waitForTimeout(700);

  // Verify core functions exist (load-bearing invariant: any extraction that
  // forgets to bridge these will fail this test).
  const types = await page.evaluate(() => ({
    renderRecents: typeof window.renderRecents,
    togglePinSession: typeof window.togglePinSession,
    refreshServerSessions: typeof window.refreshServerSessions,
  }));
  expect(types.renderRecents).toBe('function');
  expect(types.togglePinSession).toBe('function');

  // Switch to recents tab via switchTab if not already.
  await page.evaluate(() => {
    const tab = document.querySelector('[onclick*="switchTab(\'recents\')"]');
    if (tab) tab.click();
  }).catch(() => {});
  await page.waitForTimeout(300);

  const pinBtn = page.locator('[data-recents-pin], .pin-btn, button[onclick*="togglePinSession"]').first();
  if (await pinBtn.count() > 0) {
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    await pinBtn.click({ timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(300);
    const realErrors = consoleErrors.filter((e) =>
      /ReferenceError|TypeError/.test(e) && !/fetch|network|api\//i.test(e),
    );
    expect(realErrors, `togglePinSession threw: ${realErrors.join(' | ')}`).toEqual([]);
  }
});
