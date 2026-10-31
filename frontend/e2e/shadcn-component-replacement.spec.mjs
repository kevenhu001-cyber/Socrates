import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('preference Select supports keyboard selection and Escape closes only the top layer', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  const trigger = page.locator('#apiSettingsBtn');
  await trigger.click();
  const settings = page.locator('#settingsOverlay');
  const search = settings.getByRole('searchbox');
  await search.focus();
  await expect(search).toHaveCSS('box-shadow', 'none');
  await expect(settings.locator('[data-slot="input-group"]')).not.toHaveCSS('box-shadow', 'none');
  const appearance = settings.getByRole('combobox', { name: 'Appearance', exact: true });
  await appearance.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(appearance).toContainText('Dark');
  await expect(appearance).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(settings).toBeVisible();
  await expect(appearance).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.evaluate(() => document.querySelector('[data-theme-option="light"]').click());
  await trigger.click();
  await expect(appearance).toContainText('Light');
});

test('provider radio arrow navigation preserves text editing and persists the new active model', async ({ page }) => {
  await mockAuthedApp(page, { apiKeys: { providers: [
    { id: 'first', label: 'First provider', url: 'https://first.example.test/v1', model: 'first', hasKey: true, isActive: true },
    { id: 'second', label: 'Second provider', url: 'https://second.example.test/v1', model: 'second', hasKey: true, isActive: false },
  ] } });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const settings = page.locator('#settingsOverlay');
  await settings.locator('[data-section="models"]').click();
  const first = settings.locator('.provider-row[data-id="first"]');
  const second = settings.locator('.provider-row[data-id="second"]');
  const name = first.getByRole('textbox', { name: 'Display name', exact: true });
  await name.focus();
  await page.keyboard.press('ArrowDown');
  await expect(name).toBeFocused();
  await expect(first.getByRole('radio')).toBeChecked();
  await first.getByRole('radio').focus();
  await page.keyboard.press('ArrowDown');
  await expect(second.getByRole('radio')).toBeChecked();
  await expect(second.getByRole('radio')).toBeFocused();
  await expect(first.getByRole('radio')).not.toBeChecked();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('socrates-last-active-id'))).toBe('second');
});

test('sharing RadioGroup uses arrow keys and submits the selected visibility', async ({ page }) => {
  let submitted;
  await mockAuthedApp(page);
  await page.route('**/api/**/sessions/*/share', async (route) => {
    if (route.request().method() === 'POST') {
      submitted = route.request().postDataJSON();
      await route.fulfill({ status: 201, json: { token: 'private-token', url: '/a/private-token', visibility: 'private' } });
    } else await route.fulfill({ json: { token: null, visibility: 'public' } });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '11111111-1111-4111-8111-111111111111' });
    window.__socratesLegacy.messages.openShareModal();
  });
  const share = page.locator('#shareOverlay');
  const publicChoice = share.getByRole('radio', { name: 'Anyone with the link', exact: true });
  await publicChoice.click();
  await publicChoice.focus();
  await page.keyboard.press('ArrowDown');
  const privateChoice = share.getByRole('radio', { name: 'Only you', exact: true });
  await expect(privateChoice).toBeChecked();
  await expect(privateChoice).toBeFocused();
  await expect(publicChoice).not.toBeChecked();
  await page.screenshot({ path: 'test-results/shadcn-share-choices.png' });
  await share.locator('#shareCreateBtn').click();
  await expect.poll(() => submitted).toMatchObject({ visibility: 'private' });
  await expect(share.locator('#shareLinkInput')).toHaveValue(/private-token/);
});

test('provider Card fields and choices remain reachable on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
  const settings = page.locator('#settingsOverlay');
  await settings.locator('[data-section="models"]').click();
  await settings.locator('#addProviderBtn').click();
  const provider = settings.locator('.provider-row[data-id^="new-"]').first();
  const name = provider.getByRole('textbox', { name: 'Display name', exact: true });
  await name.fill('Phone provider');
  await expect(name).toBeFocused();
  await provider.getByRole('checkbox').check();
  await expect(provider.getByRole('checkbox')).toBeChecked();
  const radio = provider.getByRole('radio');
  await radio.click();
  await expect(radio).toBeChecked();
  const overflow = await settings.locator('.settings-body').evaluate(node => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/shadcn-provider-phone.png' });
});
