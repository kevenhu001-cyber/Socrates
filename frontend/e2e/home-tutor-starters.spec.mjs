import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

for (const width of [1440, 390]) {
  test(`composer stays free of suggestions in Chat and Tutor at ${width}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await mockAuthedApp(page, { lang: 'zh' });
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);
    const editor = page.locator('#composerRoot .rich-composer-editor');
    await editor.fill('我的目标：');
    for (const mode of ['Tutor', 'Chat']) {
      await page.locator(`#topMode${mode}`).click();
      await expect(page.locator('#homeSuggestion, #homeTutorStarters, #homeQuickActions, #homeLearningModes, #learningModeBar')).toHaveCount(0);
      await expect(editor).toContainText('我的目标：');
      await expect(page.locator('#composerInputWrap')).toBeVisible();
    }
    await page.screenshot({ path: `test-results/composer-no-suggestions-${encodeURIComponent(width)}.png` });
    expect(errors).toEqual([]);
  });
}
