import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('admin console signs in, saves both providers, removes embedding, and signs out', async ({ page }) => {
  let systemWrite;
  let systemHeaders;
  let embeddingWrite;
  let embeddingHeaders;
  let embeddingDelete = false;
  let loginHeaders;
  const systemModel = {
    id: 'system-model-1',
    label: 'Initial model',
    url: 'https://api.example.test/v1',
    model: 'initial-model',
    keyHint: null,
    isActive: true,
    isMultimodal: false,
    hasKey: false,
  };

  await mockAuthedApp(page);
  await page.route('**/api/admin-auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/status')) {
      await route.fulfill({ json: { configured: true, ipAllowed: true } });
    } else if (path.endsWith('/login')) {
      loginHeaders = route.request().headers();
      await route.fulfill({ json: { token: 'smoke-admin-token' } });
    } else if (path.endsWith('/verify')) {
      await route.fulfill({ json: { valid: true } });
    } else if (path.endsWith('/logout')) {
      await route.fulfill({ json: { ok: true } });
    } else {
      await route.fulfill({ status: 404, json: { message: 'Not found' } });
    }
  });
  await page.route('**/api/system-models', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: systemModel });
      return;
    }
    systemHeaders = route.request().headers();
    systemWrite = route.request().postDataJSON();
    await route.fulfill({
      json: {
        ...systemModel,
        ...systemWrite,
        hasKey: Boolean(systemWrite.key),
        keyHint: systemWrite.key ? 'test-key' : null,
      },
    });
  });
  await page.route('**/api/embedding-config**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: null });
      return;
    }
    if (route.request().method() === 'DELETE') {
      embeddingDelete = true;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    embeddingHeaders = route.request().headers();
    embeddingWrite = route.request().postDataJSON();
    await route.fulfill({
      json: {
        id: 'embedding-1',
        ...embeddingWrite,
        isActive: true,
        hasKey: Boolean(embeddingWrite.key),
        keyHint: embeddingWrite.key ? 'embedding-key' : null,
      },
    });
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => window.openNav('admin'));
  await expect(page.locator('.admin-login')).toBeVisible();
  await page.getByLabel('Admin password').fill('operator-secret');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect.poll(() => loginHeaders).not.toBeUndefined();
  expect(loginHeaders['x-csrf-token']).toBe('smoke-csrf-token');

  await expect(page.getByRole('heading', { name: 'System model (built-in / Beagle)' })).toBeVisible();
  await page.getByLabel('Display name').nth(0).fill('Updated system model');
  await page.getByLabel('API key').fill('system-secret');
  await page.getByRole('button', { name: 'Save system model' }).click();
  await expect.poll(() => systemWrite).toMatchObject({
    label: 'Updated system model',
    key: 'system-secret',
  });
  expect(systemHeaders['x-admin-token']).toBe('smoke-admin-token');
  expect(systemHeaders['x-csrf-token']).toBe('smoke-csrf-token');

  await page.getByRole('button', { name: 'Configure embedding provider' }).click();
  await page.getByLabel('Display name').nth(1).fill('Study embeddings');
  await page.getByLabel('OpenAI-compatible URL').nth(1).fill('https://embeddings.example.test/v1');
  await page.getByLabel('Model ID').nth(1).fill('study-embed-v1');
  await page.getByLabel('Dimensions').fill('768');
  await page.getByLabel('API key').nth(1).fill('embedding-secret');
  await page.getByRole('button', { name: 'Save embedding' }).click();
  await expect.poll(() => embeddingWrite).toMatchObject({
    label: 'Study embeddings',
    model: 'study-embed-v1',
    dimensions: 768,
    key: 'embedding-secret',
  });
  expect(embeddingHeaders['x-admin-token']).toBe('smoke-admin-token');
  expect(embeddingHeaders['x-csrf-token']).toBe('smoke-csrf-token');
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect.poll(() => embeddingDelete).toBe(true);
  await expect(page.getByRole('button', { name: 'Configure embedding provider' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.locator('.admin-login')).toBeVisible();
});
