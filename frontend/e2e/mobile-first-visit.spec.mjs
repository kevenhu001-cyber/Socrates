// e2e/mobile-first-visit.spec.mjs — phone first-visit and drawer contract.
//
// Three regressions this pins:
//   1. The consent banner is a fixed strip on phones; the shell reserves its
//      measured height so the composer can never sit underneath it.
//   2. The auth gate no longer offers the "Guest mode" checkbox, which only
//      wrote a localStorage flag nothing ever read.
//   3. Picking a session from the phone drawer reveals the conversation
//      instead of leaving the overlay open (desktop keeps its rail).

import { expect, test } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function sessionFixture() {
  return {
    id: SESSION_ID,
    title: 'Phone drawer fixture',
    mode: 'chat',
    phase: 'chat',
    kind: 'chat',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    pinned: false,
    tags: [],
  };
}

async function seedOneSession(page) {
  const session = sessionFixture();
  await page.route(/\/api\/(?:v2\/)?sessions(?:\?|$)/, (route) => route.fulfill({ json: { sessions: [session] } }));
  await page.route(new RegExp(`/api/(?:v2/)?sessions/${SESSION_ID}(?:\\?|$)`),
    (route) => route.fulfill({ json: { ...session, messages: [] } }));
  return session;
}

test('first-visit consent never covers the phone composer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page, { consent: false });
  await page.goto('/');
  await waitForAppShell(page);

  const banner = page.locator('#socratesCookieConsent');
  await expect(banner).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/has-cookie-consent/);

  const [bannerBox, composerBox] = await Promise.all([
    banner.boundingBox(),
    page.locator('#composerInputWrap').boundingBox(),
  ]);
  expect(bannerBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  /* The composer's bottom edge must stay above the banner's top edge — the
     original bug was a full-width overlap that hid the send button. */
  expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(bannerBox.y);

  await banner.getByRole('button', { name: /全部接受|Accept all/ }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/has-cookie-consent/);
  const reserved = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--cookie-consent-space'));
  expect(reserved).toBe('');
});

test('auth gate offers no inert guest-mode toggle', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await waitForAppShell(page);
  /* The gate template stays mounted behind the app; the removed control was
     the only checkbox it ever rendered. */
  await expect(page.locator('#authGate input[type="checkbox"]')).toHaveCount(0);
  await expect(page.locator('#authGuestCheckbox')).toHaveCount(0);
  await expect(page.locator('#authCodeGuestCheckbox')).toHaveCount(0);
});

test('picking a recent on a phone closes the drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page);
  await seedOneSession(page);
  await page.goto('/');
  await waitForAppShell(page);

  await page.locator('#sidebarOpenBtn').click();
  await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);

  const row = page.locator(`.recent-item[data-recent-actual="${SESSION_ID}"]`);
  await expect(row).toBeVisible();
  await row.click();

  await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
  await expect(page.locator('#sidebarBackdrop')).not.toHaveClass(/show/);
});

test('picking a recent on desktop leaves the rail open', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuthedApp(page);
  await seedOneSession(page);
  await page.goto('/');
  await waitForAppShell(page);

  await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
  const row = page.locator(`.recent-item[data-recent-actual="${SESSION_ID}"]`);
  await expect(row).toBeVisible();
  await row.click();

  await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
});
