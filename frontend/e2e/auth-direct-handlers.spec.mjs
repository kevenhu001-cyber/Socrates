import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp } from './_mock-api.mjs';

test('auth gate interactions are owned by the auth module', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');

  await page.evaluate(() => {
    window.showGate();
    window.showAuthSignin();
  });

  await expect(page.locator('#authGate')).toBeVisible();
  expect(await page.locator('#authGate [data-action]').count()).toBe(0);

  await page.locator('#authRegisterTab').click();
  await expect(page.locator('#authRegisterView')).toBeVisible();
  await expect(page.locator('#authSigninView')).toBeHidden();

  await page.locator('#authRegisterView .auth-foot a').click();
  await expect(page.locator('#authSigninView')).toBeVisible();

  await page.fill('#authSigninEmail', 'forgot@example.test');
  await page.locator('#authSigninView .auth-inline-link-right').click();
  await expect(page.locator('#authForgotPasswordView')).toBeVisible();
  await expect(page.locator('#authForgotEmail')).toHaveValue('forgot@example.test');

  await page.locator('#authForgotPasswordView .auth-back-link').click();
  await expect(page.locator('#authSigninView')).toBeVisible();

  await page.fill('#authSigninEmail', 'code@example.test');
  await page.locator('#authSigninView .auth-code-login-link').click();
  await expect(page.locator('#authCodeLoginView')).toBeVisible();
  await expect(page.locator('#authCodeEmail')).toHaveValue('code@example.test');

  await page.locator('#authCodeSendBtn').click();
  await expect(page.locator('#authCodeCodeWrap')).toBeVisible();
  await expect(page.locator('#authCodeSendBtn')).toBeHidden();
  await expect(page.locator('#authCodeLoginBtn')).toBeVisible();
  await expect(page.locator('#authCodeResendWrap')).toBeVisible();

  await page.locator('#authCodeLoginView .auth-back-link').click();
  await expect(page.locator('#authSigninView')).toBeVisible();

  await page.locator('#authSigninEmail').fill('');
  await page.locator('#authSigninPassword').fill('');
  await page.locator('#authSigninView').evaluate((form) => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect(page.locator('#authSigninError')).toHaveText('Please enter your email and password.');

  await page.locator('#authSigninTab').focus();
  await page.locator('#authSigninTab').press('ArrowRight');
  await expect(page.locator('#authRegisterTab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#authRegisterTab')).toHaveAttribute('tabindex', '0');
});
