// e2e/composer-tools-compat.spec.mjs — Batch 3 of the React + TypeScript migration
// Spec: when the app boots with ?react=1, the Composer "+" tools menu is
// owned by React. The legacy entry point (toggleComposerTools) still drives
// open/close/positioning; React renders the 6 menu items + dividers via the
// typed bridge. Item clicks dispatch through the legacy window.* actions.

import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('Composer tools menu React mode hydrates #composerToolsMenu eagerly', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // Eager creation: the menu element exists at boot, marked as React-owned.
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeAttached();
  await expect(menu).toHaveAttribute('data-react-migration-runtime', 'composer-tools-menu');
  await expect(menu).toHaveClass(/hidden/);

  // Bridge installed.
  const installed = await page.evaluate(() => ({
    bridge: typeof window.__socratesComposerToolsBridge === 'object' && window.__socratesComposerToolsBridge !== null,
    isOpen: window.__socratesComposerToolsBridge?.getSnapshot().isOpen,
  }));
  expect(installed).toEqual({ bridge: true, isOpen: false });

  // All 6 items rendered with the expected data-action values.
  const actions = await page.locator('#composerToolsMenu [data-action]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-action')),
  );
  expect(actions).toEqual(['upload', 'write', 'research', 'deepResearch', 'exam', 'skills']);
});

test('Composer tools menu opens via legacy entry point and React mirrors state', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // Open via the legacy window.toggleComposerTools(trigger, mode) — the
  // inline-onclick contract in index.html still uses this entry point.
  await page.evaluate(() => {
    const btn = document.getElementById('topicComposerToolsBtn');
    if (btn && typeof window.toggleComposerTools === 'function') {
      window.toggleComposerTools(btn, 'topic');
    }
  });

  const menu = page.locator('#composerToolsMenu');
  await expect(menu).not.toHaveClass(/hidden/);

  // Bridge snapshot reflects the open state + topic mode + trigger id.
  const snap = await page.evaluate(() => {
    const s = window.__socratesComposerToolsBridge?.getSnapshot();
    return s ? { isOpen: s.isOpen, mode: s.mode, triggerId: s.triggerId } : null;
  });
  expect(snap).toEqual({ isOpen: true, mode: 'topic', triggerId: 'topicComposerToolsBtn' });

  // Clicking outside closes the menu — the legacy document-level listener
  // still fires and closes via the bridge.
  await page.locator('#sidebar').click({ position: { x: 5, y: 5 } });
  await expect(menu).toHaveClass(/hidden/);

  const afterClose = await page.evaluate(() => {
    const s = window.__socratesComposerToolsBridge?.getSnapshot();
    return s?.isOpen ?? null;
  });
  expect(afterClose).toBe(false);
});

test('Composer tools menu items dispatch through legacy window.* actions', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // Capture calls to composeAction (write) and researchAction (research).
  await page.evaluate(() => {
    window.__composerCalls = [];
    window.composeAction = () => window.__composerCalls.push('write');
    window.researchAction = () => window.__composerCalls.push('research');
    window.openAttachmentPicker = () => window.__composerCalls.push('upload');
    window.toggleExtensionByKey = (key) => window.__composerCalls.push(key);
    window.openPromptTemplatesModal = () => window.__composerCalls.push('skills');
  });

  // Open menu from the chat composer.
  await page.evaluate(() => {
    const btn = document.getElementById('chatComposerToolsBtn');
    if (btn && typeof window.toggleComposerTools === 'function') {
      window.toggleComposerTools(btn, 'chat');
    }
  });
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).not.toHaveClass(/hidden/);

  // Click the "write" item (closes the menu via the legacy handler).
  await page.locator('#composerToolsMenu [data-action="write"]').click();
  await expect(menu).toHaveClass(/hidden/);

  // Re-open and click the "research" item.
  await page.evaluate(() => {
    const btn = document.getElementById('chatComposerToolsBtn');
    if (btn && typeof window.toggleComposerTools === 'function') {
      window.toggleComposerTools(btn, 'chat');
    }
  });
  await expect(menu).not.toHaveClass(/hidden/);
  await page.locator('#composerToolsMenu [data-action="research"]').click();
  await expect(menu).toHaveClass(/hidden/);

  const calls = await page.evaluate(() => window.__composerCalls);
  expect(calls).toContain('write');
  expect(calls).toContain('research');
});

test('Composer tools menu React mode always loads (no ?react=1 flag needed)', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeAttached();
  await expect(menu).toHaveAttribute('data-react-migration-runtime', 'composer-tools-menu');

  const installed = await page.evaluate(
    () => typeof window.__socratesComposerToolsBridge === 'object' && window.__socratesComposerToolsBridge !== null,
  );
  expect(installed).toBe(true);
});