// e2e/settings-modal.spec.mjs — M4 step 4.5b regression coverage.
// The settings modal is React-owned (SettingsModal.tsx renders the full
// overlay into #settingsModalReactRoot at boot); legacy ui/settings.js
// still renders provider rows / tone presets into the React containers and
// publishes open + externalApiOn through the bridge. These specs pin the
// converted contract: open/close visibility, the React-rendered skeleton
// (toggle + add/clear/cancel/save), and legacy-rendered dynamic content
// (provider list, tone presets) surviving React ownership.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await login(page);
});

test('settings modal opens, renders React skeleton + legacy provider rows, and closes', async ({ page }) => {
  // Open via the legacy window binding (the model-picker "add" path).
  await page.evaluate(() => window.openSettings());

  const overlay = page.locator('#settingsOverlay');
  await expect(overlay).toBeVisible();

  // React-owned skeleton: toggle + action buttons + containers.
  await expect(overlay.locator('#stgToggleTrack')).toBeVisible();
  await expect(overlay.locator('#addProviderBtn')).toBeVisible();
  await expect(overlay.locator('#clearSettingsBtn')).toBeVisible();
  await expect(overlay.locator('#cancelSettingsBtn')).toBeVisible();
  await expect(overlay.locator('#saveSettingsBtn')).toBeVisible();

  // Legacy-rendered dynamic content: provider list + tone presets.
  await expect(overlay.locator('#providerList')).toBeVisible();
  await expect(overlay.locator('#tonePresetOptions')).toBeVisible();

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
  await page.evaluate(() => window.openSettings());
  const overlay = page.locator('#settingsOverlay');
  const track = overlay.locator('#stgToggleTrack');

  const initialOn = await track.evaluate((el) => el.classList.contains('on'));
  await overlay.locator('#stgToggle').click();
  const toggledOn = await track.evaluate((el) => el.classList.contains('on'));
  expect(toggledOn).toBe(!initialOn);

  // Persisted value survives a reopen.
  await overlay.locator('#settingsCloseBtn').click();
  await page.evaluate(() => window.openSettings());
  const afterReopen = await page
    .locator('#settingsOverlay #stgToggleTrack')
    .evaluate((el) => el.classList.contains('on'));
  expect(afterReopen).toBe(toggledOn);
});

test('add provider renders editable rows into the legacy-rendered list', async ({ page }) => {
  await page.evaluate(() => window.openSettings());
  const overlay = page.locator('#settingsOverlay');

  // Empty state: the built-in row is the empty-state affordance (historical
  // renderer behavior — it is replaced, not appended to, once a custom
  // provider exists).
  const builtInRow = overlay.locator('#providerList .provider-row.built-in-row');
  await expect(builtInRow).toBeVisible();

  // First add: the legacy addProvider() pushes a `new-*` provider and the
  // legacy renderer paints the editable row into the React-owned container.
  await overlay.locator('#addProviderBtn').click();
  const firstNewRow = overlay.locator('#providerList .provider-row[data-id^="new-"]');
  await expect(firstNewRow).toBeVisible();
  await expect(firstNewRow.locator('input[data-field="label"]')).toHaveValue('');
  const providersAfterFirst = await page.evaluate(() => (window.apiConfig.providers || []).length);
  expect(providersAfterFirst).toBe(2); // built-in + new

  // Second add: appends another row (custom rows grow 1 -> 2).
  await overlay.locator('#addProviderBtn').click();
  await expect(overlay.locator('#providerList .provider-row[data-id^="new-"]')).toHaveCount(2);
  const providersAfterSecond = await page.evaluate(() => (window.apiConfig.providers || []).length);
  expect(providersAfterSecond).toBe(3);
});
