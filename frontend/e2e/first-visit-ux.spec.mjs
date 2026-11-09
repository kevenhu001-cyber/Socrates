import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('desktop sign-in presents consent beside the form', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockAuthedApp(page, { consent: false, lang: 'zh' });
  await page.goto('/?lang=en');
  await waitForAppShell(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveURL(/\/$/);
  await page.evaluate(() => window.__socratesLegacy.auth.showGate());
  const card = page.locator('.auth-card');
  const consent = page.locator('#socratesCookieConsent');
  await expect(card.getByRole('heading', { name: /your next question starts here/i })).toBeVisible();
  await expect(card.locator('.auth-intro')).toBeVisible();
  await expect(consent).toBeVisible();
  const cardBox = await card.boundingBox();
  const consentBox = await consent.boundingBox();
  expect(consentBox.x).toBeGreaterThan(cardBox.x + cardBox.width);
  expect(consentBox.x - (cardBox.x + cardBox.width)).toBeLessThan(60);
  expect(consentBox.y + consentBox.height).toBeLessThanOrEqual(800);
  await page.screenshot({ path: 'test-results/first-visit/sign-in-desktop.png' });
  await consent.locator('[data-consent-choice="essential"]').click();
  await expect(consent).toBeHidden();
});

test('marketing question is carried into the app draft after the shell hydrates', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'zh' });
  const question = 'Why does a positive test not prove the condition?';
  await page.goto(`/?lang=en&q=${encodeURIComponent(question)}`);
  await waitForAppShell(page);
  const composer = page.getByRole('textbox', { name: 'Ask Socrates' });
  await expect(composer).toContainText(question);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(new URL(page.url()).searchParams.has('q')).toBe(false);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('socrates:marketing-question'))).toBeNull();
});

test('empty library offers a direct file upload', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route(/\/api\/(v2\/)?files(\?|$)/, route => route.fulfill({ json: { files: [], hasMore: false } }));
  await page.route(/\/api\/(v2\/)?artifacts(\?|$)/, route => route.fulfill({ json: { artifacts: [] } }));
  await page.goto('/');
  await waitForAppShell(page);
  await page.locator('#navLibrary').click();
  const upload = page.locator('.library-directory .workspace-empty').getByRole('button', { name: /upload|上传文件/i });
  await expect(upload).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await upload.click();
  expect((await chooser).isMultiple()).toBe(true);
});
