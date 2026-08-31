// e2e/cmd-k-compat.spec.mjs — Batch 1.5 of the React + TypeScript migration
// Spec: when the app boots with ?react=1, the Cmd+K palette is owned by
// React. The legacy window.openCmdK() / onCmdKInput() entry points still
// drive behaviour — React renders the modal contents, the legacy module
// owns the state machine.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('Cmd-K React mode hydrates the overlay with React', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // The overlay element is the same DOM node the legacy app uses — only the
  // attribute set proves React took over.
  const overlay = page.locator('#cmdKOverlay');
  await expect(overlay).toHaveAttribute('data-mounted-by', 'cmd-k');

  // The modal child should also be marked (React owns its subtree).
  const modal = page.locator('#cmdKModal, .cmd-k-modal').first();
  await expect(modal).toHaveAttribute('data-mounted-by', 'cmd-k');

  // Cmd-K bridge should be installed and expose a snapshot.
  const snapshot = await page.evaluate(() => {
    const bridge = window.__socratesCmdK;
    if (!bridge || typeof bridge.getSnapshot !== 'function') return null;
    const s = bridge.getSnapshot();
    return {
      isOpen: s.isOpen,
      revision: s.revision,
      hasQuery: typeof s.query === 'string',
      resultsIsArray: Array.isArray(s.results),
    };
  });
  expect(snapshot).not.toBeNull();
  expect(snapshot).toMatchObject({
    isOpen: false,
    hasQuery: true,
    resultsIsArray: true,
  });
});

test('Cmd-K React mode opens via the legacy entry point and React renders the modal', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // Trigger via the legacy window.openCmdK() — proves the React bridge
  // observes the same entry point the rest of the app uses.
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

  // Bridge snapshot should reflect the open state + query.
  const afterType = await page.evaluate(() => {
    const s = window.__socratesCmdK?.getSnapshot();
    return s ? { isOpen: s.isOpen, query: s.query } : null;
  });
  expect(afterType).toMatchObject({ isOpen: true, query: 'react' });

  // Escape closes the palette — the React component dispatches through
  // the legacy onCmdKKey, which still toggles the overlay's hidden class.
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveClass(/hidden/);
});

test('Cmd-K React mode always loads (no ?react=1 flag needed)', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const overlay = page.locator('#cmdKOverlay');
  await expect(overlay).toHaveAttribute('data-mounted-by', 'cmd-k');

  const hasBridge = await page.evaluate(() => typeof window.__socratesCmdK === 'object' && window.__socratesCmdK !== null);
  expect(hasBridge).toBe(true);
});