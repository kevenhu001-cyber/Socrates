// e2e/settings-modal.spec.mjs — Settings ownership regression coverage.
// SettingsModal.tsx owns the overlay and provider/tone markup; a typed provider
// service owns configuration and persistence. These specs pin open/close,
// provider CRUD, tone selection, and persistence through visible UI/API effects.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp } from './_mock-api.mjs';

test.beforeEach(async ({ page }, testInfo) => {
  const apiKeys = testInfo.title.includes('provider activation failure') || testInfo.title.includes('provider update patches existing')
    ? { providers: [
      { id: 'provider-one', label: 'First provider', url: 'https://first.example.test/v1', model: 'first', hasKey: true, isActive: true },
      { id: 'provider-two', label: 'Second provider', url: 'https://second.example.test/v1', model: 'second', hasKey: true, isActive: false },
    ] }
    : undefined;
  await mockAuthedApp(page, { apiKeys });
  await gotoAndSettle(page, '/');
  await login(page);
});

/* The provider and tone controls live in separate category panes;
   the modal opens on General, so these specs navigate to Models & voice. */
async function openModelsPane(page) {
  await page.evaluate(() => window.openSettings());
  const overlay = page.locator('#settingsOverlay');
  await expect(overlay).toBeVisible();
  await overlay.locator('.settings-nav [data-section="models"]').click();
  return overlay;
}

test('settings modal opens with React-owned providers and tones, and closes', async ({ page }) => {
  // Open via the legacy window binding (the model-picker "add" path).
  const overlay = await openModelsPane(page);

  // React-owned settings controls and provider list.
  await expect(overlay.locator('#stgToggleTrack')).toBeVisible();
  await expect(overlay.locator('#addProviderBtn')).toBeVisible();
  await expect(overlay.locator('#clearSettingsBtn')).toBeVisible();
  await expect(overlay.locator('#cancelSettingsBtn')).toBeVisible();
  await expect(overlay.locator('#saveSettingsBtn')).toBeVisible();

  // React owns both provider rows and tone preset buttons.
  await expect(overlay.locator('#providerList')).toBeVisible();
  const builtInRow = overlay.locator('#providerList .provider-row.built-in-row');
  await expect(builtInRow).toContainText('Built-in · Active');
  await expect(builtInRow).not.toContainText(/settings\.(builtInTag|builtInHint|noCustomProviders)/);

  await overlay.locator('.settings-nav [data-section="personalization"]').click();
  const toneOptions = overlay.locator('#tonePresetOptions');
  await expect(toneOptions.locator('.tone-preset-btn')).toHaveCount(5);
  const friendlyTone = toneOptions.locator('.tone-preset-btn[data-tone="friendly"]');
  await friendlyTone.click();
  await expect(friendlyTone).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('socrates-tone'))).toBe('friendly');

  // Close via the React close button.
  await overlay.locator('#settingsCloseBtn').click();
  await expect(overlay).toBeHidden();
});

test('settings modal closes on backdrop click and via Esc', async ({ page }) => {
  await page.evaluate(() => window.openSettings());
  const overlay = page.locator('#settingsOverlay');
  await expect(overlay).toBeVisible();

  // Backdrop click (target === overlay host) closes.
  await overlay.click({ position: { x: 8, y: 8 } });
  await expect(overlay).toBeHidden();

  // Esc closes (React-owned keydown handler).
  await page.evaluate(() => window.openSettings());
  await expect(overlay).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
});

test('settings toggle flips the track class and persists', async ({ page }) => {
  const overlay = await openModelsPane(page);
  const track = overlay.locator('#stgToggleTrack');

  const initialOn = await track.evaluate((el) => el.classList.contains('on'));
  const expectedClass = initialOn ? /^stg-toggle-track$/ : /^stg-toggle-track on$/;
  await overlay.locator('#stgToggle').click();
  await expect(track).toHaveClass(expectedClass);

  // Persisted value survives a reopen.
  await overlay.locator('#settingsCloseBtn').click();
  await page.evaluate(() => window.openSettings());
  await expect(track).toHaveClass(expectedClass);
});

test('React-owned provider rows stay synchronized with provider configuration', async ({ page }) => {
  const overlay = await openModelsPane(page);

  // With no custom provider, the built-in model is the provider-list empty state.
  const builtInRow = overlay.locator('#providerList .provider-row.built-in-row');
  await expect(builtInRow).toBeVisible();

  // The provider service adds a typed store entry; React paints the new editable row.
  await overlay.locator('#addProviderBtn').click();
  const firstNewRow = overlay.locator('#providerList .provider-row[data-id^="new-"]').first();
  await expect(firstNewRow).toBeVisible();
  await expect(firstNewRow.locator('input[data-field="label"]')).toHaveValue('');
  await expect(firstNewRow.locator('input[data-field="label"]')).toBeFocused();
  const firstProviderId = await firstNewRow.getAttribute('data-id');
  const firstProviderRow = overlay.locator(`#providerList .provider-row[data-id="${firstProviderId}"]`);
  await firstNewRow.locator('input[data-field="label"]').fill('React-owned provider');
  await expect(firstNewRow.locator('input[data-field="label"]')).toHaveValue('React-owned provider');
  await firstNewRow.locator('input[data-field="key"]').fill('test-secret-value');
  await expect(firstNewRow.locator('input[data-field="key"]')).toHaveValue('test-secret-value');
  expect(await page.evaluate(() => 'apiConfig' in window)).toBe(false);
  expect(await page.evaluate(() => 'renderProviderList' in window)).toBe(false);

  // Second add: appends another row (custom rows grow 1 -> 2).
  await overlay.locator('#addProviderBtn').click();
  await expect(overlay.locator('#providerList .provider-row[data-id^="new-"]')).toHaveCount(2);

  await firstProviderRow.locator('.provider-active-btn').click();
  await expect(firstProviderRow).toHaveClass(/active/);
  await firstProviderRow.locator('.provider-del').click();
  await expect(firstProviderRow).toHaveCount(0);
});

test('provider save submits the configured fields and secret to the API', async ({ page }) => {
  const overlay = await openModelsPane(page);
  await overlay.locator('#addProviderBtn').click();
  const row = overlay.locator('#providerList .provider-row[data-id^="new-"]').first();
  await row.locator('input[data-field="label"]').fill('Saved provider');
  await row.locator('input[data-field="url"]').fill('https://models.example.test/v1');
  await row.locator('input[data-field="model"]').fill('model-v1');
  await row.locator('input[data-field="key"]').fill('secret-value-123');
  const requestPromise = page.waitForRequest((request) =>
    request.method() === 'POST' && request.url().includes('/api-key'),
  );
  await overlay.locator('#saveSettingsBtn').click();
  const request = await requestPromise;
  expect(request.postDataJSON()).toMatchObject({
    label: 'Saved provider',
    url: 'https://models.example.test/v1',
    model: 'model-v1',
    key: 'secret-value-123',
  });
  await expect.poll(() => page.evaluate(() => 'apiConfig' in window || 'renderProviderList' in window)).toBe(false);
});

test('provider update patches existing fields and a replacement key', async ({ page }) => {
  const overlay = await openModelsPane(page);
  const row = overlay.locator('#providerList .provider-row[data-id="provider-one"]');
  await row.locator('input[data-field="label"]').fill('Updated provider');
  await row.locator('input[data-field="model"]').fill('updated-model');
  await row.locator('input[data-field="key"]').fill('replacement-secret-123');
  await page.route(/\/api\/(v2\/)?api-key\/provider-one(?:\?|$)/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  const patch = page.waitForRequest((request) =>
    request.method() === 'PATCH' && /\/api\/(v2\/)?api-key\/provider-one(?:\?|$)/.test(request.url()),
  );

  await overlay.locator('#saveSettingsBtn').click();

  expect((await patch).postDataJSON()).toMatchObject({
    label: 'Updated provider',
    model: 'updated-model',
    key: 'replacement-secret-123',
  });
  await expect(row.locator('input[data-field="label"]')).toHaveValue('Updated provider');
});

test('provider validation errors render from React-owned state', async ({ page }) => {
  const overlay = await openModelsPane(page);
  await overlay.locator('#addProviderBtn').click();
  const row = overlay.locator('#providerList .provider-row[data-id^="new-"]').first();
  await expect(row).toBeVisible();
  await row.locator('input[data-field="url"]').fill('ftp://example.test');
  await overlay.locator('#saveSettingsBtn').click();
  await expect(row.locator('.settings-field-error')).toContainText('URL must start with http:// or https://');
});

test('provider activation failure restores the previous active selection', async ({ page }) => {
  const overlay = await openModelsPane(page);
  const first = overlay.locator('#providerList .provider-row[data-id="provider-one"]');
  const second = overlay.locator('#providerList .provider-row[data-id="provider-two"]');
  await expect(first.locator('.provider-active-btn')).toHaveAttribute('aria-pressed', 'true');
  await page.route(/\/api\/(v2\/)?api-key\/provider-two(?:\?|$)/, async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'activation unavailable' }) });
  });

  await second.locator('.provider-active-btn').click();

  await expect(first.locator('.provider-active-btn')).toHaveAttribute('aria-pressed', 'true');
  await expect(second.locator('.provider-active-btn')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.msg-toast').filter({ hasText: 'Failed to activate provider' })).toBeVisible();
});

test('provider save keeps successful rows when another provider request fails', async ({ page }) => {
  const overlay = await openModelsPane(page);
  await overlay.locator('#addProviderBtn').click();
  await overlay.locator('#addProviderBtn').click();
  const rows = overlay.locator('#providerList .provider-row[data-id^="new-"]');
  await expect(rows).toHaveCount(2);
  for (const [index, label] of ['Saved row', 'Failed row'].entries()) {
    const row = rows.nth(index);
    await row.locator('input[data-field="label"]').fill(label);
    await row.locator('input[data-field="url"]').fill(`https://${index ? 'failed' : 'saved'}.example.test/v1`);
    await row.locator('input[data-field="model"]').fill(`model-${index}`);
    await row.locator('input[data-field="key"]').fill(`secret-value-${index}-123`);
  }
  await page.route(/\/api\/(v2\/)?api-key(?:\?|$)/, async (route) => {
    if (route.request().method() !== 'POST') { await route.fallback(); return; }
    const body = route.request().postDataJSON();
    if (body.label === 'Failed row') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'provider unavailable' }) });
      return;
    }
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'provider-saved' }) });
  });

  await overlay.locator('#saveSettingsBtn').click();

  await expect(overlay.locator('#providerList .provider-row[data-id="provider-saved"]')).toBeVisible();
  await expect(overlay.locator('#providerList .provider-row[data-id^="new-"]')).toHaveCount(1);
  await expect(page.locator('.msg-toast').filter({ hasText: 'Saved 1 provider(s), but 1 failed' })).toBeVisible();
});
