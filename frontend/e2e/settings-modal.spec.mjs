// e2e/settings-modal.spec.mjs — Settings ownership regression coverage.
// SettingsModal.tsx owns the overlay and all provider/tone markup; the legacy
// service updates provider configuration through the typed settings bridge.
// These specs pin open/close, provider CRUD, tone selection, and persistence.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
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

  // The legacy service adds provider data; React paints the new editable row.
  await overlay.locator('#addProviderBtn').click();
  const firstNewRow = overlay.locator('#providerList .provider-row[data-id^="new-"]').first();
  await expect(firstNewRow).toBeVisible();
  await expect(firstNewRow.locator('input[data-field="label"]')).toHaveValue('');
  await expect(firstNewRow.locator('input[data-field="label"]')).toBeFocused();
  const firstProviderId = await firstNewRow.getAttribute('data-id');
  const firstProviderRow = overlay.locator(`#providerList .provider-row[data-id="${firstProviderId}"]`);
  await firstNewRow.locator('input[data-field="label"]').fill('React-owned provider');
  await expect.poll(() => page.evaluate((id) => window.apiConfig.providers.find((provider) => provider.id === id)?.label, firstProviderId)).toBe('React-owned provider');
  await firstNewRow.locator('input[data-field="key"]').fill('test-secret-value');
  const bridgeKey = await page.evaluate((id) => window.__socratesSettingsBridge.getSnapshot().providers.find((provider) => provider.id === id)?.key, firstProviderId);
  expect(bridgeKey).toBeUndefined();
  const providersAfterFirst = await page.evaluate(() => (window.apiConfig.providers || []).length);
  expect(providersAfterFirst).toBe(2); // built-in + new

  // Second add: appends another row (custom rows grow 1 -> 2).
  await overlay.locator('#addProviderBtn').click();
  await expect(overlay.locator('#providerList .provider-row[data-id^="new-"]')).toHaveCount(2);
  const providersAfterSecond = await page.evaluate(() => (window.apiConfig.providers || []).length);
  expect(providersAfterSecond).toBe(3);

  await firstProviderRow.locator('.provider-active-btn').click();
  await expect(firstProviderRow).toHaveClass(/active/);
  await firstProviderRow.locator('.provider-del').click();
  await expect(firstProviderRow).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window.apiConfig.providers || []).length)).toBe(2);
});

test('provider validation errors render from React-owned state', async ({ page }) => {
  const overlay = await openModelsPane(page);
  await overlay.locator('#addProviderBtn').click();
  const row = overlay.locator('#providerList .provider-row[data-id^="new-"]').first();
  await expect(row).toBeVisible();
  await row.locator('input[data-field="url"]').fill('ftp://example.test');
  const invalidProviderId = await row.getAttribute('data-id');
  await expect.poll(() => page.evaluate((id) => window.apiConfig.providers.find((provider) => provider.id === id)?.url, invalidProviderId)).toBe('ftp://example.test');
  await overlay.locator('#saveSettingsBtn').click();
  await expect(row.locator('.settings-field-error')).toContainText('URL must start with http:// or https://');
});
