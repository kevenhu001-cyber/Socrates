import { test, expect } from '@playwright/test';
import { mockAuthedApp } from './_mock-api.mjs';

const origin = 'https://app.topodrive.top';
const state = 'a'.repeat(64);
const codeChallenge = 'b'.repeat(43);
const code = 'c'.repeat(64);
const callback = `${origin}/auth/android/callback#code=${code}&state=${state}`;

async function mockProductionOrigin(page) {
  // All production-origin bytes are served from the local test build. No
  // real deployment, credentials, Android device or production request is used.
  await page.route(origin + '/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) throw new Error('Unmocked test API');
    const response = await route.fetch({ url: 'http://127.0.0.1:4173' + url.pathname + url.search });
    await route.fulfill({ response });
  });
  await mockAuthedApp(page);
  await page.context().addCookies([{ name: 'csrf', value: 'smoke-csrf-token', url: origin, secure: true }]);
}

test('existing browser session requires account consent and an explicit verified HTTPS return link', async ({ page }) => {
  await mockProductionOrigin(page);
  let issued = 0;
  await page.route('**/api/v2/auth/mobile/browser/authorize', async (route) => {
    issued++;
    expect(route.request().postDataJSON()).toEqual({ state, codeChallenge });
    expect(route.request().headers()['x-csrf-token']).toBe('smoke-csrf-token');
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({ json: { url: callback, expiresAt: new Date(Date.now() + 300000).toISOString() } });
  });
  await page.goto(`${origin}/?native_login=1&state=${state}&code_challenge=${codeChallenge}`);
  const dialog = page.locator('#androidLoginHandoff');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('smoke@example.test');
  expect(new URL(page.url()).search).toBe('');
  expect(issued).toBe(0);
  await dialog.getByRole('button', { name: '确认此账号并继续' }).click();
  const link = dialog.getByRole('link', { name: '返回 Socrates Android' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', callback);
  await expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
  expect(issued).toBe(1);
  await page.screenshot({ path: 'test-results/browser-login-handoff-ready.png', fullPage: true });
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).toHaveCount(0);
});

test('browser fallback strips callback secrets and does not authorize another login', async ({ page }) => {
  await mockProductionOrigin(page);
  let issued = 0;
  await page.route('**/api/v2/auth/mobile/browser/authorize', async (route) => { issued++; await route.abort(); });
  await page.goto(callback);
  await expect(page.getByRole('dialog')).toContainText('未能自动打开 Android 应用');
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('#androidLoginHandoff')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain(code);
  expect(issued).toBe(0);
});
