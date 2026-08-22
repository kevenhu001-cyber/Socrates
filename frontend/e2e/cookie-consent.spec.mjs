import { test, expect } from '@playwright/test';
import { mockAuthedApp } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page, { consent: false });
});

test('first visit shows the consent banner and accepts persist on reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' });
  const banner = page.locator('#socratesCookieConsent');
  await expect(banner).toBeVisible({ timeout: 15_000 });

  await page.locator('[data-consent-choice="accept"]').click();
  await expect(banner).toBeHidden();

  const stored = await page.evaluate(() => {
    return {
      local: localStorage.getItem('socrates-cookie-consent'),
      cookie: document.cookie.includes('socrates_consent='),
    };
  });
  expect(stored.local).toContain('"nonEssential":true');
  expect(stored.cookie).toBe(true);

  await page.reload({ waitUntil: 'commit' });
  await expect(banner).toBeHidden();
});

test('essential-only choice persists and still hides the banner on later visits', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' });
  const banner = page.locator('#socratesCookieConsent');
  await expect(banner).toBeVisible({ timeout: 15_000 });

  await page.locator('[data-consent-choice="essential"]').click();
  await expect(banner).toBeHidden();

  const stored = await page.evaluate(() => localStorage.getItem('socrates-cookie-consent'));
  expect(stored).toContain('"nonEssential":false');

  // Non-essential client cookies must remain blocked under the
  // essential-only choice.
  const blocked = await page.evaluate(() => {
    document.cookie = 'future_analytics=1; path=/; max-age=3600';
    return document.cookie.includes('future_analytics=1');
  });
  expect(blocked).toBe(false);

  await page.reload({ waitUntil: 'commit' });
  await expect(banner).toBeHidden();
});
