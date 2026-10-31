import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('usage modal renders API data and refreshes when the period changes', async ({ page }) => {
  await mockAuthedApp(page);
  const requestedDays = [];
  let calendarDay;
  await page.route(/\/api\/(?:v2\/)?usage\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/daily')) {
      const days = url.searchParams.get('days');
      requestedDays.push(days);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ entries: [{ day: calendarDay, tokens: 789, messages: 3 }] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ beagleUsed: 10, beagleLimit: 1000 }),
    });
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  expect(await page.evaluate(() => ({
    loadUsageData: 'loadUsageData' in window,
    loadUsageMonth: 'loadUsageMonth' in window,
    showUsageTip: 'showUsageTip' in window,
    hideUsageTip: 'hideUsageTip' in window,
  }))).toEqual({ loadUsageData: false, loadUsageMonth: false, showUsageTip: false, hideUsageTip: false });
  calendarDay = await page.evaluate(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
  });
  await page.evaluate(() => window.__socratesLegacy.navigation.openUsageModal());

  const overlay = page.locator('#usageOverlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('.usage-stat').filter({ hasText: 'Total tokens' }).locator('.usage-stat-val')).toHaveText('789');
  const activeDay = overlay.locator(`[data-date="${calendarDay}"][data-tokens="789"][data-msgs="3"]`);
  await expect(activeDay).toHaveCount(1);
  await activeDay.hover();
  await expect(overlay.locator('#usageTooltip')).toContainText(`${calendarDay} — 789 tokens, 3 messages`);

  await overlay.locator('[data-usage-period="month"]').click();
  await expect.poll(() => requestedDays).toEqual(['365', '31']);
  await expect(overlay.locator('[data-usage-period="month"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(overlay.locator('.usage-stat').filter({ hasText: 'Total tokens' }).locator('.usage-stat-val')).toHaveText('789');
});
