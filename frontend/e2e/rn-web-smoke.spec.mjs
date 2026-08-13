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
  await expect(page.getByText('Socrates', { exact: true })).toBeVisible();
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

test('React Native web shell renders the authenticated navigation for each viewport', async ({ page }, testInfo) => {
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
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();

  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('button', { name: 'Close navigation' }).first()).toBeVisible();
    await expect(page.getByText('Socrates', { exact: true })).toBeVisible();
  } else {
    await expect(page.getByText('Socrates', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New chat' }).first()).toBeVisible();
  }

  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
