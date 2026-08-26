import { test, expect } from '@playwright/test';

test('React Native web shell boots and keeps the sign-in flow interactive', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/status of 401 \(Unauthorized\)/i.test(message.text())) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unauthorized' }),
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  /* "Socrates" appears in the boot loading splash, the sign-in card, and the
     sidebar header. Scope the assertion to the sign-in card so a future
     splash/header tweak can't re-introduce the strict-mode collision. */
  const signInCard = page.getByLabel('Sign in');
  await expect(signInCard).toBeVisible();
  await expect(signInCard.getByText('Socrates', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Create account' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();

  await page.getByRole('tab', { name: 'Create account' }).click();
  await expect(page.getByText(/Sign up with your email/i)).toBeVisible();
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Please enter your email and password.')).toBeVisible();

  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('React Native web shell renders the authenticated navigation for each viewport', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/status of 401 \(Unauthorized\)/i.test(message.text())) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'rn-web-smoke-user',
          email: 'rn-web-smoke@example.com',
          displayName: 'Web Smoke',
          isGuest: true,
        },
      }),
    });
  });
  await page.route('**/sessions?limit=50', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessions: [] }),
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  /* The sidebar header (logo + brand) and the compose button are visible on
     every viewport. There is no separate "Open navigation" toggle yet — the
     mobile RN web shell uses the same desktop shell, so the off-canvas
     pattern lives outside this assertion. */
  const sidebarHeader = page.locator('#sidebarHeader');
  await expect(sidebarHeader).toBeVisible();
  await expect(sidebarHeader.getByText('Socrates', { exact: true })).toBeVisible();
  await expect(page.locator('#newChatBtn')).toBeVisible();

  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
