// e2e/settings-modal.spec.mjs — Settings ownership regression coverage.
// SettingsModal.tsx owns the overlay and provider/tone markup; a typed provider
// service owns configuration and persistence. These specs pin open/close,
// provider CRUD, tone selection, and persistence through visible UI/API effects.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }, testInfo) => {
  const hydrateSettings = testInfo.title.includes('restore server preferences');
  const apiKeys = testInfo.title.includes('provider activation failure') || testInfo.title.includes('provider update patches existing')
    ? { providers: [
      { id: 'provider-one', label: 'First provider', url: 'https://first.example.test/v1', model: 'first', hasKey: true, isActive: true },
      { id: 'provider-two', label: 'Second provider', url: 'https://second.example.test/v1', model: 'second', hasKey: true, isActive: false },
    ] }
    : undefined;
  const user = hydrateSettings ? {
    customInstructions: 'Use my saved account instructions.',
    preferences: { theme: 'dark', language: 'en', imageModel: 'gpt-image-2', voiceLanguage: 'en-US' },
  } : undefined;
  await mockAuthedApp(page, { apiKeys, user, lang: hydrateSettings ? false : undefined });
  await gotoAndSettle(page, '/');
  await login(page);
});

/* The provider and tone controls live in separate category panes;
   the modal opens on General, so these specs navigate to Models & voice. */
async function openModelsPane(page) {
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const overlay = page.locator('#settingsOverlay');
  await expect(overlay).toBeVisible();
  await overlay.locator('.settings-nav [data-section="models"]').click();
  return overlay;
}

test('tone choices have separate readable labels and expose the selected state', async ({ page }) => {
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const overlay = page.locator('#settingsOverlay');
  await overlay.locator('.settings-nav [data-section="personalization"]').click();
  const options = overlay.locator('.tone-preset-btn');
  await expect(options).toHaveCount(5);
  for (const option of await options.all()) {
    const label = await option.locator('.tone-preset-label').boundingBox();
    const description = await option.locator('.tone-preset-desc').boundingBox();
    expect(label).not.toBeNull();
    expect(description).not.toBeNull();
    expect(description.y).toBeGreaterThanOrEqual(label.y + label.height);
  }
  const friendly = overlay.locator('.tone-preset-btn[data-tone="friendly"]');
  await friendly.click();
  await expect(friendly).toHaveAttribute('aria-pressed', 'true');
  await expect(friendly.locator('[data-icon=inline-end]')).toBeVisible();
  await expect(overlay.locator('.tone-preset-btn[aria-pressed="true"]')).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 768 });
  const bounds = await overlay.locator('#tonePresetOptions').evaluate((element) => ({
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width);
  await expect(friendly).toHaveAttribute('aria-pressed', 'true');
});

test('settings modal opens with React-owned providers and tones, and closes', async ({ page }) => {
  const memoryRequests = [];
  const serverMemoryId = '550e8400-e29b-41d4-a716-446655440000';
  let serverMemories = [];
  await page.route(/\/api\/(?:v2\/)?memory(?:\/[^?]*)?(?:\?.*)?$/, async (route) => {
    const request = route.request();
    memoryRequests.push({ method: request.method(), url: request.url(), body: request.postDataJSON() });
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ memories: serverMemories }) });
    } else if (request.method() === 'POST') {
      const entry = { id: serverMemoryId, text: request.postDataJSON().text, createdAt: new Date().toISOString() };
      serverMemories = [...serverMemories, entry];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(entry) });
    } else if (request.method() === 'PATCH') {
      serverMemories = serverMemories.map((entry) => entry.id === serverMemoryId
        ? { ...entry, text: request.postDataJSON().text }
        : entry);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: serverMemoryId }) });
    } else {
      serverMemories = serverMemories.filter((entry) => !request.url().includes(entry.id));
      await route.fulfill({ status: 204 });
    }
  });
  // Open through the typed navigation action shared with the React model menu.
  const overlay = await openModelsPane(page);
  expect(await page.evaluate(() => typeof window.SERVER_HAS_BEAGLE_KEY)).toBe('undefined');

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

  const instructions = overlay.locator('.settings-textarea');
  await instructions.fill('Use concise examples.');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('socrates-custom-instructions') || '{}').response))
    .toBe('Use concise examples.');

  await overlay.locator('.settings-memory-key-input').fill('preference');
  await overlay.locator('.settings-memory-val-input').fill('prefers TypeScript');
  await overlay.locator('.settings-memory-add-form button[type="submit"]').click();
  const memory = overlay.locator('.settings-memory-item');
  await expect(memory).toContainText('preference');
  await expect(memory).toContainText('prefers TypeScript');
  await expect.poll(() => memoryRequests.some((request) => request.method === 'POST')).toBe(true);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('socrates-memory-store') || '[]').find((item) => item.key === 'preference')?.id)).toBe(serverMemoryId);
  expect(memoryRequests.find((request) => request.method === 'POST')?.body).toEqual({ text: 'preference: prefers TypeScript' });

  await overlay.locator('.settings-memory-key-input').fill('preference');
  await overlay.locator('.settings-memory-val-input').fill('prefers Python');
  await overlay.locator('.settings-memory-add-form button[type="submit"]').click();
  await expect(memory).toContainText('prefers Python');
  await expect.poll(() => memoryRequests.some((request) => request.method === 'PATCH')).toBe(true);
  expect(memoryRequests.find((request) => request.method === 'PATCH')?.body).toEqual({ text: 'preference: prefers Python' });

  await overlay.locator('#settingsCloseBtn').click();
  await page.reload();
  await waitForAppShell(page);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('socrates-memory-store') || '[]')
    .find((item) => item.key === 'preference'))).toEqual({
    id: serverMemoryId,
    key: 'preference',
    value: 'prefers Python',
    createdAt: expect.any(Number),
    updatedAt: expect.any(Number),
  });
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const reloadedOverlay = page.locator('#settingsOverlay');
  await reloadedOverlay.locator('.settings-nav [data-section="personalization"]').click();
  await expect(reloadedOverlay.locator('.settings-memory-item')).toContainText('prefers Python');

  await reloadedOverlay.locator('.settings-memory-item .settings-memory-del-btn').click();
  await expect(reloadedOverlay.locator('.settings-memory-item')).toHaveCount(0);
  await expect.poll(() => memoryRequests.filter((request) => request.method === 'DELETE').length).toBe(1);
  expect(memoryRequests.find((request) => request.method === 'DELETE')?.url).toContain(serverMemoryId);

  await reloadedOverlay.locator('.settings-memory-key-input').fill('clear-target');
  await reloadedOverlay.locator('.settings-memory-val-input').fill('remove from all devices');
  await reloadedOverlay.locator('.settings-memory-add-form button[type="submit"]').click();
  await expect(reloadedOverlay.locator('.settings-memory-item')).toContainText('clear-target');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('socrates-memory-store') || '[]').find((item) => item.key === 'clear-target')?.id)).toBe(serverMemoryId);
  await reloadedOverlay.getByRole('button', { name: 'Clear all', exact: true }).click();
  const memoryConfirm = page.getByRole('alertdialog', { name: 'Clear all memories?' });
  await expect(memoryConfirm).toBeVisible();
  await memoryConfirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(reloadedOverlay.locator('.settings-memory-item')).toHaveCount(0);
  await expect.poll(() => memoryRequests.filter((request) => request.method === 'DELETE').length).toBe(2);

  // Close via the React close button.
  await reloadedOverlay.locator('#settingsCloseBtn').click();
  await expect(reloadedOverlay).toBeHidden();
});

test('all settings categories render their own pane and mobile search reaches hidden categories', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const overlay = page.locator('#settingsOverlay');
  await expect(overlay).toBeVisible();
  const sections = [
    ['general', 'General'], ['display', 'Display'], ['notifications', 'Notifications'],
    ['personalization', 'Personalization'], ['models', 'Models & voice'],
    ['apps', 'Apps & connections'], ['data', 'Data controls'], ['account', 'Account'],
  ];
  for (const [key, title] of sections) {
    await overlay.locator(`.settings-nav [data-section="${key}"]`).click();
    await expect(overlay.locator('.settings-pane:visible h2')).toHaveText(title);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const search = overlay.getByRole('searchbox', { name: 'Search settings' });
  await expect(search).toBeVisible();
  const categories = overlay.locator('.settings-nav-categories');
  expect(await categories.evaluate((element) => getComputedStyle(element).flexDirection)).toBe('row');
  expect(await categories.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await overlay.locator('.settings-nav [data-section="general"]').click();
  const accountTab = overlay.locator('.settings-nav [data-section="account"]');
  await accountTab.click();
  await expect(overlay.locator('.settings-pane:visible h2')).toHaveText('Account');
  expect(await accountTab.evaluate((element) => {
    const item = element.getBoundingClientRect();
    const strip = element.parentElement.getBoundingClientRect();
    return item.left >= strip.left && item.right <= strip.right;
  })).toBe(true);
  await search.fill('字号');
  await expect(overlay.locator('.settings-nav button')).toHaveCount(1);
  await expect(overlay.locator('.settings-nav [data-section="display"]')).toBeVisible();
  await expect(overlay.locator('.settings-pane:visible h2')).toHaveText('Display');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('model provider actions stay inside the settings pane on mobile', async ({ page }) => {
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const overlay = page.locator('#settingsOverlay');
  await page.setViewportSize({ width: 390, height: 844 });
  await overlay.locator('.settings-nav [data-section="models"]').click();
  const actions = overlay.locator('.settings-provider-actions');
  await actions.scrollIntoViewIfNeeded();
  const bounds = await actions.evaluate((element) => {
    const body = element.closest('.settings-body').getBoundingClientRect();
    const buttons = [...element.querySelectorAll('button')].map((button) => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });
    return { bodyLeft: body.left, bodyRight: body.right, buttons };
  });
  for (const button of bounds.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(bounds.bodyLeft);
    expect(button.right).toBeLessThanOrEqual(bounds.bodyRight);
  }
});

test('display settings persist text size, content width, grid, and background colors', async ({ page }) => {
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const overlay = page.locator('#settingsOverlay');
  await overlay.locator('.settings-nav [data-section="display"]').click();

  const fontGroup = overlay.locator('.settings-choice--segmented').filter({ hasText: 'Text size' });
  await fontGroup.locator('[data-slot="toggle-group-item"]').filter({ hasText: /^XL$/ }).click();
  const widthGroup = overlay.locator('.settings-choice--segmented').filter({ hasText: 'Content width' });
  await widthGroup.locator('[data-slot="toggle-group-item"]').filter({ hasText: /^XL$/ }).click();
  await expect.poll(() => page.evaluate(() => ({
    font: getComputedStyle(document.documentElement).getPropertyValue('--app-font-scale').trim(),
    width: getComputedStyle(document.documentElement).getPropertyValue('--app-width-scale').trim(),
  }))).toEqual({ font: '1.375', width: '1.7' });

  const grid = overlay.getByRole('switch', { name: 'Conversation grid' });
  await grid.click();
  await expect(grid).toHaveAttribute('aria-checked', 'true');

  const colors = overlay.locator('.settings-bg-pickers input[type="color"]');
  await colors.nth(0).evaluate((input) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '#123456');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await colors.nth(1).evaluate((input) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '#eeeeee');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('socrates-display') || '{}')))
    .toMatchObject({ font: 1.375, width: 1.7, showGrid: true, darkBg: '#123456', lightBg: '#eeeeee' });

  const resetButtons = overlay.getByRole('button', { name: 'Reset', exact: true });
  await resetButtons.nth(0).click();
  await resetButtons.nth(1).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('socrates-display') || '{}')))
    .toMatchObject({ darkBg: '', lightBg: '' });
});

test('custom instructions save once after typing and sync through the account endpoint', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => {
    if (request.method() !== 'PATCH' || !/\/api\/(?:v2\/)?users\/me(?:\?|$)/.test(request.url())) return;
    requests.push({ url: request.url(), body: request.postDataJSON() });
  });
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const overlay = page.locator('#settingsOverlay');
  await overlay.locator('.settings-nav [data-section="personalization"]').click();
  const instructions = overlay.locator('#settings-custom-instructions');
  await instructions.fill('Draft one');
  await instructions.fill('Use concise examples and clear steps.');
  await expect.poll(() => requests.length, { timeout: 3000 }).toBe(1);
  expect(new URL(requests[0].url).pathname).toMatch(/\/api\/(?:v2\/)?users\/me$/);
  expect(requests[0].body).toEqual({ customInstructions: '[How to respond]\nUse concise examples and clear steps.' });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('socrates-custom-instructions') || '{}').response))
    .toBe('Use concise examples and clear steps.');
  await expect(overlay.locator('.settings-save-error')).toHaveCount(0);
});

test('general and model preferences update the app and sync supported account fields', async ({ page }) => {
  const preferencePatches = [];
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && /\/api\/(?:v2\/)?users\/me\/preferences(?:\?|$)/.test(request.url())) {
      preferencePatches.push(request.postDataJSON());
    }
  });
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const overlay = page.locator('#settingsOverlay');

  await overlay.locator('#settings-appearance').click();
  await page.getByRole('option', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await overlay.locator('#settings-theme-style').click();
  await page.getByRole('option', { name: 'Philosophy', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'philosophy');

  await overlay.locator('#settings-language').click();
  await page.getByRole('option', { name: '中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');
  await overlay.locator('.settings-nav [data-section="models"]').click();

  await overlay.locator('#settings-voice-language').click();
  await page.getByRole('option', { name: '中文', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('socrates-voice-language'))).toBe('zh-CN');
  await overlay.locator('#settings-image-model').fill('gpt-image-2');
  await overlay.getByRole('button', { name: '同步图片模型', exact: true }).click();
  await expect.poll(() => preferencePatches.some((patch) => patch.imageModel === 'gpt-image-2')).toBe(true);
  await expect.poll(() => preferencePatches.some((patch) => patch.voiceLanguage === 'zh-CN')).toBe(true);
  expect(preferencePatches).toContainEqual({ theme: 'dark' });
  expect(preferencePatches).toContainEqual({ language: 'zh' });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('socrates-image-model'))).toBe('gpt-image-2');
});

test('settings restore server preferences when this browser has no local values', async ({ page }) => {
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const overlay = page.locator('#settingsOverlay');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(overlay.locator('#settings-language')).toContainText('English');

  await overlay.locator('.settings-nav [data-section="models"]').click();
  await expect(overlay.locator('#settings-image-model')).toHaveValue('gpt-image-2');
  await expect(overlay.locator('#settings-voice-language')).toContainText('English');

  await overlay.locator('.settings-nav [data-section="personalization"]').click();
  await expect(overlay.locator('#settings-custom-instructions')).toHaveValue('Use my saved account instructions.');
});

test('settings utility links reach Plugins and Library, while account actions stay guarded', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => {
    if (request.method() === 'PATCH' || request.method() === 'DELETE') {
      requests.push({ method: request.method(), url: request.url(), body: request.postDataJSON() });
    }
  });
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const overlay = page.locator('#settingsOverlay');

  await overlay.locator('.settings-nav [data-section="apps"]').click();
  await overlay.getByRole('button', { name: 'Open plugins', exact: true }).click();
  await expect(overlay).toBeHidden();
  await expect(page.locator('.plugin-directory')).toBeVisible();

  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  await overlay.locator('.settings-nav [data-section="data"]').click();
  await overlay.getByRole('button', { name: 'Open library', exact: true }).click();
  await expect(overlay).toBeHidden();
  await expect(page.locator('.library-directory')).toBeVisible();

  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  await overlay.locator('.settings-nav [data-section="account"]').click();
  const displayName = overlay.getByRole('textbox', { name: 'Display name' });
  await displayName.fill('Settings QA learner');
  await displayName.press('Enter');
  await expect.poll(() => requests.filter((request) => request.method === 'PATCH' && /\/users\/me(?:\?|$)/.test(request.url)).length).toBe(1);
  expect(requests.find((request) => request.method === 'PATCH' && /\/users\/me(?:\?|$)/.test(request.url))?.body)
    .toMatchObject({ displayName: 'Settings QA learner' });

  await overlay.locator('.settings-choice').filter({ hasText: 'Token usage' }).getByRole('button', { name: 'View' }).click();
  await expect(page.locator('#usageOverlay')).toBeVisible();
  await page.locator('#usageOverlay .usage-close').click();
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  await overlay.locator('.settings-nav [data-section="account"]').click();
  await overlay.locator('.settings-choice').filter({ hasText: 'Archived sessions' }).getByRole('button', { name: 'Manage' }).click();
  await expect(page.locator('#storageModalOverlay')).toBeVisible();
  await page.locator('#storageModalOverlay').getByRole('button', { name: 'Close' }).click();

  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  await overlay.locator('.settings-nav [data-section="account"]').click();
  await overlay.getByRole('button', { name: 'Delete account' }).click();
  const deleteConfirm = page.getByRole('alertdialog', { name: 'Delete your account?' });
  await expect(deleteConfirm).toBeVisible();
  await deleteConfirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(deleteConfirm).toHaveCount(0);
  expect(requests.some((request) => request.method === 'DELETE' && /\/auth\/account/.test(request.url))).toBe(false);
  await expect(overlay).toBeVisible();
});


test('settings modal closes on backdrop click and via Esc', async ({ page }) => {
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const overlay = page.locator('#settingsOverlay');
  await expect(overlay).toBeVisible();

  // Backdrop click (target === overlay host) closes.
  await overlay.click({ position: { x: 8, y: 8 } });
  await expect(overlay).toBeHidden();

  // Esc closes (React-owned keydown handler).
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  await expect(overlay).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
});

test('settings keeps the focus where the user moved it and hands it back to the trigger on close', async ({ page }) => {
  const trigger = page.locator('#apiSettingsBtn');
  await trigger.click();
  const overlay = page.locator('#settingsOverlay');
  await expect(overlay).toBeVisible();

  // Move the focus while the deferred initial focus is still pending. Once it
  // lands it must not take the focus back from the control the user picked.
  const nav = overlay.locator('.settings-nav button').first();
  await nav.focus();
  await page.waitForTimeout(250);
  await expect(nav).toBeFocused();

  // Closing returns the focus to the trigger that opened the dialog.
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('settings switch toggles by its label and persists', async ({ page }) => {
  const overlay = await openModelsPane(page);
  const track = overlay.getByRole('switch', { name: 'Use External API' });

  const initialOn = await track.getAttribute('aria-checked') === 'true';
  const expectedState = initialOn ? 'false' : 'true';
  await overlay.locator('#stgToggle').click();
  await expect(track).toHaveAttribute('aria-checked', expectedState);

  // Persisted value survives a reopen.
  await overlay.locator('#settingsCloseBtn').click();
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  await expect(track).toHaveAttribute('aria-checked', expectedState);
});

test('clear API settings confirms before clearing provider configuration', async ({ page }) => {
  const overlay = await openModelsPane(page);
  await expect(overlay.getByRole('button', { name: 'Clear API settings', exact: true })).toBeVisible();
  await overlay.locator('#clearSettingsBtn').click();
  const confirmation = page.getByRole('alertdialog', { name: 'Clear API settings?' });
  await expect(confirmation).toBeVisible();
  await confirmation.locator('#confirmOkBtn').click();
  await expect(confirmation).toHaveCount(0);
  await expect(overlay.locator('#providerList .provider-row.built-in-row')).toBeVisible();
  await expect(overlay).toBeVisible();
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
  await expect(row.locator('[data-slot="field-error"]')).toContainText('URL must start with http:// or https://');
});

test('provider activation failure restores the previous active selection', async ({ page }) => {
  const overlay = await openModelsPane(page);
  const first = overlay.locator('#providerList .provider-row[data-id="provider-one"]');
  const second = overlay.locator('#providerList .provider-row[data-id="provider-two"]');
  await expect(first.locator('.provider-active-btn')).toHaveAttribute('aria-checked', 'true');
  await page.route(/\/api\/(v2\/)?api-key\/provider-two(?:\?|$)/, async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'activation unavailable' }) });
  });

  await second.locator('.provider-active-btn').click();

  await expect(first.locator('.provider-active-btn')).toHaveAttribute('aria-checked', 'true');
  await expect(second.locator('.provider-active-btn')).toHaveAttribute('aria-checked', 'false');
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

test('settings mounts only visited categories and preserves provider drafts across navigation and reopen', async ({ page }) => {
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const overlay = page.locator('#settingsOverlay');
  await expect(overlay.locator('.settings-pane')).toHaveCount(1);
  await expect(overlay.locator('.settings-pane h2')).toHaveText('General');
  await expect(overlay.locator('#providerList')).toHaveCount(0);
  await overlay.locator('[data-section="models"]').click();
  await overlay.locator('#addProviderBtn').click();
  const draft = overlay.locator('.provider-row[data-id^="new-"] input[data-field="label"]').first();
  await draft.fill('Keep this draft');
  await overlay.locator('[data-section="general"]').click();
  await expect(overlay.locator('.settings-pane')).toHaveCount(2);
  await expect(draft).toBeHidden();
  await overlay.locator('[data-section="models"]').click();
  await expect(draft).toHaveValue('Keep this draft');
  await overlay.locator('#settingsCloseBtn').click();
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  await expect(draft).toBeVisible();
  await expect(draft).toHaveValue('Keep this draft');
  await overlay.locator('.settings-nav input').fill('Account');
  await expect(overlay.locator('.settings-nav button')).toHaveCount(1);
  await expect(overlay.locator('.settings-nav button')).toHaveText('Account');
});

test('settings category load failure stays local and can be retried', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const report = JSON.parse(readFileSync(resolve(import.meta.dirname, '../dist/.vite/entry-graph.json'), 'utf8'));
  const pane = report.modules.find((module) => module.id === 'src/react/settings/DisplaySettingsPane.tsx');
  let failures = 0;
  await page.route(`**/${pane.chunk}*`, async (route) => {
    failures++;
    await route.abort('failed');
  });
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const overlay = page.locator('#settingsOverlay');
  await overlay.locator('[data-section="display"]').click();
  await expect(overlay.getByRole('alert')).toContainText('Could not load this category');
  expect(failures).toBeGreaterThan(0);
  await overlay.locator('[data-section="general"]').click();
  await expect(overlay.locator('.settings-pane:visible h2')).toHaveText('General');
  await overlay.locator('[data-section="display"]').click();
  await overlay.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect.poll(() => failures).toBeGreaterThan(1);
  await expect(overlay.getByRole('alert')).toBeVisible();
  await page.unroute(`**/${pane.chunk}*`);
  await overlay.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(overlay.locator('.settings-pane:visible h2')).toHaveText('Display');
  await expect(overlay.getByRole('alert')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
});
