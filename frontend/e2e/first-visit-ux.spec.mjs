import { test } from './_state-fixture.mjs';
import { expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('sign-in centers the form with consent above it on desktop and phones', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => localStorage.setItem('socrates-theme', 'dark'));
  await mockAuthedApp(page, { consent: false, lang: 'zh' });
  await page.goto('/?lang=en');
  await waitForAppShell(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveURL(/\/$/);
  const consent = page.locator('#socratesCookieConsent:popover-open');
  await expect(consent).toBeVisible();
  const appConsentBox = await consent.boundingBox();
  await page.evaluate(() => window.__socratesTestState.actions.showGate());
  const card = page.locator('.auth-card');
  const gate = page.locator('#authGate');
  await expect(card.getByRole('heading', { name: 'Sign in to Socrates' })).toBeVisible();
  await expect(card.locator('#authSigninEmail')).toHaveCSS(
    'font-family',
    /^"Geist Sans", "Noto Sans SC",/,
  );
  await expect(gate).toHaveCSS('background-color', 'rgb(14, 14, 14)');
  await expect(gate).toHaveCSS('background-image', 'none');
  await expect(card).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(card).toHaveCSS('border-width', '0px');
  await expect(card.locator('#authSigninEmail')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(card.locator('#authGithubBtn')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(card.locator('#authSigninBtn')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(card.locator('#authSigninBtn')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(card.locator('#authGithubBtn svg')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(consent).toBeVisible();
  const cardBox = await card.boundingBox();
  const consentBox = await consent.boundingBox();
  expect(cardBox.x + cardBox.width / 2).toBeCloseTo(640, 0);
  expect(consentBox).toEqual(appConsentBox);
  expect(1280 - consentBox.x - consentBox.width).toBeCloseTo(20, 0);
  expect(800 - consentBox.y - consentBox.height).toBeCloseTo(20, 0);
  await page.screenshot({ path: 'test-results/first-visit/sign-in-desktop.png' });
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await gate.evaluate((element) => element.scrollWidth)).toBe(320);
  await expect(card.getByRole('heading', { name: 'Sign in to Socrates' })).toBeInViewport();
  const mobileConsentBox = await consent.boundingBox();
  expect(mobileConsentBox.x + mobileConsentBox.width / 2).toBeCloseTo(160, 0);
  expect(568 - mobileConsentBox.y - mobileConsentBox.height).toBeCloseTo(10, 0);
  await page.screenshot({ path: 'test-results/first-visit/sign-in-mobile.png' });
  await consent.locator('[data-consent-choice="essential"]').click();
  await expect(consent).toBeHidden();
});

test('marketing question is carried into the app draft after the shell hydrates', async ({
  page,
}) => {
  await mockAuthedApp(page, { lang: 'zh' });
  const question = 'Why does a positive test not prove the condition?';
  await page.goto(`/?lang=en&q=${encodeURIComponent(question)}`);
  await waitForAppShell(page);
  const composer = page.getByRole('textbox', { name: 'Ask Socrates' });
  await expect(composer).toContainText(question);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(new URL(page.url()).searchParams.has('q')).toBe(false);
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('socrates:marketing-question')))
    .toBeNull();
});

test('empty library offers a direct file upload', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route(/\/api\/(v2\/)?files(\?|$)/, (route) =>
    route.fulfill({ json: { files: [], hasMore: false } }),
  );
  await page.route(/\/api\/(v2\/)?artifacts(\?|$)/, (route) =>
    route.fulfill({ json: { artifacts: [] } }),
  );
  await page.goto('/');
  await waitForAppShell(page);
  await page.locator('#navLibrary').click();
  const upload = page
    .locator('.library-directory .ui-page-empty')
    .getByRole('button', { name: /upload|上传文件/i });
  await expect(upload).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await upload.click();
  expect((await chooser).isMultiple()).toBe(true);
});
