import { test, expect } from '@playwright/test';

/**
 * Universal App auth smoke (apps/socrates web export). Starts logged out
 * (/auth/me 401) and exercises the full gate: register notice, forgot
 * notice, then emailed-code sign in to the app. Every call is mocked.
 */
test('universal auth gate registers, recovers and signs in with a code', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/api/v2/auth/me', (route) => route.fulfill({
    status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Unauthorized' }),
  }));
  await page.route('**/api/v2/auth/register', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }),
  }));
  await page.route('**/api/v2/auth/forgot-password', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }),
  }));
  await page.route('**/api/v2/auth/send-code', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }),
  }));
  await page.route('**/api/v2/auth/mobile/login-with-code', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      user: { id: 'u1', email: 't@e.c', displayName: 'T' },
      accessToken: 'fresh', refreshToken: 'fresh-refresh',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }),
  }));
  await page.route('**/api/v2/projects', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }),
  }));
  await page.route('**/api/v2/sessions?limit=50', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }),
  }));
  await page.route('**/api/v2/sessions?limit=50&archived=true', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [], nextCursor: null }),
  }));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 20000 });

  // Register: pending account + verification notice, no sign in yet.
  await page.getByRole('button', { name: 'Create a new account' }).click();
  await page.getByLabel('Email', { exact: true }).fill('t@e.c');
  await page.getByLabel('New password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Account created — verify via the emailed link, then sign in.')).toBeVisible();

  // Forgot: anti-enumeration notice.
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email', { exact: true }).fill('t@e.c');
  await page.getByRole('button', { name: 'Email reset link' }).click();
  await expect(page.getByText('If the address is registered, a reset link is on its way.')).toBeVisible();

  // Code login: send + verify lands in the app with a stored session.
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await page.getByRole('button', { name: 'Use a login code instead' }).click();
  await page.getByLabel('Email', { exact: true }).fill('t@e.c');
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByText('Code sent — check your email, then enter it above.')).toBeVisible();
  await page.getByLabel('Login code').fill('ABCDEFGH');
  await page.getByRole('button', { name: 'Verify & sign in' }).click();
  await expect(page.getByRole('button', { name: 'Choose model' })).toBeVisible({ timeout: 20000 });
  expect(await page.evaluate(() => localStorage.getItem('socrates.auth.tokens'))).toMatch(/fresh/);

  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});
