import { test, expect } from '@playwright/test';
import { openSidebarSettings } from './_universal-helpers.mjs';

/**
 * Universal App providers smoke (apps/socrates web export). Exercises the
 * Models & keys screen: list, activate, add and delete. Keys are
 * server-held (list exposes hasKey only) — the mocks assert the client
 * sends the key once on create and never reads it back.
 */
test('universal providers list, activate, add and delete', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const seen = [];
  const providers = [
    { id: 'k1', label: 'Beagle', url: 'https://api.example.com/v1', model: 'beagle', isActive: true, isBuiltIn: true, hasKey: true },
    { id: 'k2', label: 'Custom', url: 'https://llm.example.com/v1', model: 'custom-1', isActive: false, isBuiltIn: false, hasKey: true },
  ];

  await page.route('**/api/v2/auth/me', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'u1', email: 't@e.c', displayName: 'T' } }),
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
  await page.route('**/api/v2/account/usage', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      user: { id: 'u1', email: 't@e.c', displayName: 'T' },
      usage: { sessionCount: 0, providerCount: 2, graphNodes: 0, beagleUsed: 0, beagleLimit: 1000000 },
    }),
  }));
  await page.route('**/api/v2/api-key', async (route) => {
    const body = route.request().postDataJSON() || {};
    if (route.request().method() === 'POST') {
      seen.push({ method: 'POST', body });
      providers.forEach((row) => { row.isActive = false; });
      const created = { id: 'k3', label: body.label || 'Custom', url: body.url, model: body.model, isActive: true, isBuiltIn: false, hasKey: true };
      providers.unshift(created);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers }) });
  });
  await page.route('**/api/v2/api-key/*', async (route) => {
    const id = route.request().url().split('/').at(-1);
    if (route.request().method() === 'PATCH') {
      providers.forEach((row) => { row.isActive = row.id === id; });
      const row = providers.find((row) => row.id === id) || {};
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) });
    }
    const index = providers.findIndex((row) => row.id === id);
    if (index >= 0) providers.splice(index, 1);
    return route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Choose model' })).toBeVisible({ timeout: 20000 });

  // Settings entry shows the active model; opening loads the list. The
  // settings gear lives in the sidebar footer (baseline chrome).
  async function openSettings() {
    const gear = page.getByRole('button', { name: 'Open settings' });
    const trigger = page.getByTestId('socrates-sidebar-account-trigger');
    if (!(await gear.isVisible()) && !(await trigger.isVisible())) {
      await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    }
    await openSidebarSettings(page);
  }

  await openSettings();
  await expect(page.getByRole('button', { name: 'Models & keys' })).toBeVisible();
  await expect(page.getByText('beagle ›')).toBeVisible();
  await page.getByRole('button', { name: 'Models & keys' }).click();
  await expect(page.getByText('Keys are stored encrypted on the server')).toBeVisible();

  // Activate the custom provider.
  await page.getByRole('button', { name: 'Use Custom' }).click();
  await expect(page.getByText('● Custom')).toBeVisible();

  // Add a provider: the key travels once in the create body.
  await page.getByRole('button', { name: 'Add provider' }).click();
  await page.getByLabel('Label').fill('My Model');
  await page.getByLabel('API base URL (https)').fill('https://models.example.com/v1');
  await page.getByLabel('Model id').fill('my-model');
  await page.getByLabel('API key').fill('secret-key-123');
  await page.getByRole('button', { name: 'Add provider' }).last().click();
  await expect(page.getByText('● My Model')).toBeVisible();
  expect(seen.some((call) => call.body?.key === 'secret-key-123')).toBe(true);

  // Delete it again (two-tap confirm). Deleting the active provider
  // leaves none active — same as the server truth.
  await page.getByRole('button', { name: 'Delete My Model' }).click();
  await page.getByRole('button', { name: 'Confirm delete My Model' }).click();
  await expect(page.getByText('My Model')).toHaveCount(0);
  await expect(page.getByText('○ Custom')).toBeVisible();

  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});
