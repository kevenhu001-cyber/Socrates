// e2e/cmd-k-compat.spec.mjs — Batch 1.5 of the React + TypeScript migration
// Spec: when the app boots with ?react=1, the Cmd+K palette is owned by
// React. The legacy window.openCmdK() entry still opens it; React sends input
// and key actions through the typed legacy gateway and shared module store.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('Cmd-K React mode hydrates the overlay with React', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // The overlay element is the same DOM node the legacy app uses; ownership
  // is module-private and no global state bridge is installed.
  const overlay = page.locator('#cmdKOverlay');
  await expect(overlay).not.toHaveAttribute('data-mounted-by', /.+/);

  // The React-owned modal child must be present without a migration marker.
  const modal = page.locator('#cmdKModal, .cmd-k-modal').first();
  await expect(modal).not.toHaveAttribute('data-mounted-by', /.+/);

  await expect(modal).toHaveAttribute('data-react-cmdk-state', 'closed');
  expect(await page.evaluate(() => !('__socratesCmdK' in window))).toBe(true);
});

test('Cmd-K React mode opens via the legacy entry point and React renders the modal', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  expect(await page.evaluate(() => ({
    onCmdKInput: typeof window.onCmdKInput,
    onCmdKKey: typeof window.onCmdKKey,
  }))).toEqual({ onCmdKInput: 'undefined', onCmdKKey: 'undefined' });

  // Return a server result so the shared state publication is observable in React.
  await page.route('**/search**', (route) => route.fulfill({
    json: { hits: [{ id: 'cmdk-e2e-result', title: 'React search result', snippet: 'module store result' }] },
  }));

  // Trigger via the legacy window.openCmdK() used by the rest of the app.
  await page.evaluate(() => {
    if (typeof window.openCmdK === 'function') window.openCmdK();
  });

  const overlay = page.locator('#cmdKOverlay');
  await expect(overlay).not.toHaveClass(/hidden/);

  // The React-rendered input is the one the legacy element used to own —
  // same id, same focus behaviour, same handler wiring (now via React).
  const input = page.locator('#cmdKInput').first();
  await expect(input).toBeAttached();
  await input.focus();
  await page.keyboard.type('react', { delay: 30 });
  await expect(input).toHaveValue(/react/);

  await expect(page.locator('#cmdKModal')).toHaveAttribute('data-react-cmdk-state', 'open');
  const result = page.locator('.cmd-k-row[data-id="cmdk-e2e-result"]');
  await expect(result).toBeVisible();
  await expect(result).toHaveClass(/selected/);

  // Escape closes the palette through the typed cmdK action, which still
  // toggles the overlay's hidden class.
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveClass(/hidden/);
});

test('Cmd-K React mode always loads (no ?react=1 flag needed)', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const overlay = page.locator('#cmdKOverlay');
  await expect(overlay).not.toHaveAttribute('data-mounted-by', /.+/);

  const retired = await page.evaluate(() => !('__socratesCmdK' in window));
  expect(retired).toBe(true);
});
