import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('one editor retains per-surface drafts and workflow tokens, then resets both for a new chat', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  expect(await page.evaluate(() => '__socratesComposerController' in window)).toBe(false);

  const editor = page.locator('#composerRoot .rich-composer-editor');
  const plus = page.locator('#composerToolsBtn');
  const writeAction = page.locator('#composerToolsMenu .composer-tools-desktop-items [data-composer-action="write"]');
  await expect(editor).toBeVisible();
  await editor.fill('topic draft');
  await plus.click();
  await writeAction.click();
  await expect(editor.locator('.composer-extension-token')).toHaveCount(1);
  await page.evaluate(() => {
    window.__composerNodeForLifecycle = document.querySelector('#composerRoot .rich-composer-editor');
    window.__testActivateMainView('chatView');
  });

  // Workflow mode is shared into both composer surfaces.
  await expect(editor.locator('.composer-extension-token')).toHaveCount(1);
  await editor.fill('chat draft');
  await plus.click();
  await writeAction.click();
  await expect(editor.locator('.composer-extension-token')).toHaveCount(1);

  await page.evaluate(() => window.__testActivateMainView('topicSetup'));
  await expect(editor).toContainText('topic draft');
  await expect(editor.locator('.composer-extension-token')).toHaveCount(1);
  expect(await page.evaluate(() => window.__composerNodeForLifecycle === document.querySelector('#composerRoot .rich-composer-editor'))).toBe(true);

  await page.evaluate(() => window.__testActivateMainView('chatView'));
  await expect(editor).toContainText('chat draft');
  await expect(editor.locator('.composer-extension-token')).toHaveCount(1);
  expect(await page.evaluate(() => window.__composerNodeForLifecycle === document.querySelector('#composerRoot .rich-composer-editor'))).toBe(true);

  await page.evaluate(() => window.startNewChat());
  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(editor).toHaveText('');
  await expect(page.locator('#composerRoot [data-composer-extension-token]')).toHaveCount(0);
  await page.evaluate(() => window.__testActivateMainView('chatView'));
  await expect(editor).toHaveText('');
});
