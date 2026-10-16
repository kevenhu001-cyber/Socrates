import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.addInitScript(() => {
    localStorage.setItem('socrates-theme', 'light');
    localStorage.setItem('socrates-lang', 'zh');
  });
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => window.setLang('zh'));
});

test('tutor cards append editable prompts without sending or losing the draft', async ({ page }) => {
  await expect(page.locator('.home-tutor-starters')).toBeHidden();
  await page.locator('#topModeTutor').click();
  await expect(page.locator('body')).toHaveAttribute('data-app-mode', 'tutor');
  await expect(page.locator('.home-quick-actions')).toBeHidden();
  await expect(page.locator('.home-tutor-card')).toHaveCount(3);
  const editor = page.locator('#composerRoot .rich-composer-editor');
  await editor.fill('我的目标：');
  await page.locator('[data-home-prompt="understand"]').click();
  await expect(editor).toContainText('我的目标：');
  await expect(editor).toContainText('帮我理解一个概念');
  await expect(editor).toBeFocused();
  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(page.locator('#composerPrimaryBtn')).toBeEnabled();
  await expect.poll(async () => {
    const shell = await page.locator('#composerInputWrap').boundingBox();
    const send = await page.locator('#composerPrimaryBtn').boundingBox();
    return !!shell && !!send && send.y + send.height <= shell.y + shell.height + 1;
  }).toBe(true);
  await page.screenshot({ path: 'test-results/home-tutor-starters-desktop.png', fullPage: true });
  await page.locator('#topModeChat').click();
  await expect(page.locator('.home-tutor-starters')).toBeHidden();
  await expect(editor).toContainText('我的目标：');
});

test('search shortcut mirrors the composer toggle and returns keyboard focus', async ({ page }) => {
  const search = page.locator('[data-home-action="research"]');
  const initial = await search.getAttribute('aria-pressed');
  await search.click();
  await expect(search).toHaveAttribute('aria-pressed', initial === 'true' ? 'false' : 'true');
  await expect(page.locator('#composerRoot .rich-composer-editor')).toBeFocused();
  await page.evaluate(() => {
    window.webSearchOn = true;
    document.dispatchEvent(new CustomEvent('socrates:websearchchange', { detail: { on: true } }));
  });
  await expect(search).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.home-quick-action-dismiss').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-home-action="write"]')).toBeFocused();
});

test('reduced motion stops the mode slider and tutor entrance', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#topModeTutor').click();
  await expect(page.locator('.home-tutor-starters')).toBeVisible();
  expect(await page.locator('.top-mode-switch-thumb').evaluate(el => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThanOrEqual(0.001);
  expect(await page.locator('.home-tutor-starters').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.screenshot({ path: 'test-results/home-tutor-empty-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.home-tutor-starters')).toBeHidden();
  await expect(page.locator('#composerInputWrap')).toBeVisible();
});
