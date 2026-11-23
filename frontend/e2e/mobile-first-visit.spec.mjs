// e2e/mobile-first-visit.spec.mjs — phone first-visit and drawer contract.
//
// Three regressions this pins:
//   1. The consent banner floats over the phone composer at its usual position.
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
  await page.route(/\/api\/(?:v2\/)?sessions(?:\?|$)/, (route) =>
    route.fulfill({ json: { sessions: [session] } }),
  );
  await page.route(new RegExp(`/api/(?:v2/)?sessions/${SESSION_ID}(?:\\?|$)`), (route) =>
    route.fulfill({ json: { ...session, messages: [] } }),
  );
  return session;
}

test('first-visit consent overlays the phone composer without shifting it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page, { consent: false });
  await page.goto('/');
  await waitForAppShell(page);

  const banner = page.locator('#socratesCookieConsent:popover-open');
  const composer = page.locator('#composerInputWrap');
  await expect(banner).toBeVisible();

  const [bannerBox, composerBox] = await Promise.all([
    banner.boundingBox(),
    composer.boundingBox(),
  ]);
  expect(bannerBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  expect(composerBox.y + composerBox.height).toBeGreaterThan(bannerBox.y);
  expect(bannerBox.y + bannerBox.height).toBeGreaterThan(composerBox.y);

  await banner.getByRole('button', { name: /全部接受|Accept all/ }).click();
  await expect(page.locator('#socratesCookieConsent')).toHaveCount(0);
  expect(await composer.boundingBox()).toEqual(composerBox);
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

test('phone drawer pins chats through the row menu and shows their pinned status', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page);
  const session = await seedOneSession(page);
  await page.route(new RegExp(`/api/(?:v2/)?sessions/${SESSION_ID}(?:\\?|$)`), async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fallback();
      return;
    }
    Object.assign(session, route.request().postDataJSON());
    await route.fulfill({ json: { session } });
  });
  await page.goto('/');
  await waitForAppShell(page);
  await page.locator('#sidebarOpenBtn').click();

  const row = page.locator(`.recent-item[data-recent-actual="${SESSION_ID}"]`);
  const more = row.getByRole('button', { name: 'Session actions' });
  const pinned = row.getByRole('img', { name: 'Pinned' });
  await expect(row.locator('.recent-item-actions button')).toHaveCount(1);
  await expect(more).toHaveCSS('width', '44px');
  await expect(more).toHaveCSS('height', '44px');
  await expect(pinned).toHaveCount(0);
  await more.click();
  await page.getByRole('menuitem', { name: 'Pin chat' }).click();
  await expect(pinned).toBeVisible();
  expect(session.pinned).toBe(true);

  await more.click();
  await page.getByRole('menuitem', { name: 'Unpin' }).click();
  await expect(pinned).toHaveCount(0);
  expect(session.pinned).toBe(false);
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
