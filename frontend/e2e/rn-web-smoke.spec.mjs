import { test, expect } from '@playwright/test';

test('React Native web shell boots and keeps the sign-in flow interactive', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Socrates', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Create account' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();

  await page.getByRole('tab', { name: 'Create account' }).click();
  await expect(page.getByText(/Sign up with your email/i)).toBeVisible();
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Please enter your email.')).toBeVisible();

  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
