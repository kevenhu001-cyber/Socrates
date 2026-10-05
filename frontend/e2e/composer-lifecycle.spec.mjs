import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('one editor retains per-surface drafts and tokens, then resets both for a new chat', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const editor = page.locator('#composerRoot .rich-composer-editor');
  await expect(editor).toBeVisible();
  await editor.fill('topic draft');
  await page.evaluate(() => {
    window.__socratesComposerController.setExtensionToken('topic', {
      key: 'topic-workflow', title: 'Topic workflow', icon: '',
    });
    window.__composerNodeForLifecycle = document.querySelector('#composerRoot .rich-composer-editor');
    window.__testActivateMainView('chatView');
  });

  await expect(editor).toHaveText('');
  await expect(page.locator('#composerRoot [data-extension-key="topic-workflow"]')).toHaveCount(0);
  await editor.fill('chat draft');
  await page.evaluate(() => window.__socratesComposerController.setExtensionToken('chat', {
    key: 'chat-workflow', title: 'Chat workflow', icon: '',
  }));

  await page.evaluate(() => window.__testActivateMainView('topicSetup'));
  await expect(editor).toContainText('topic draft');
  await expect(page.locator('#composerRoot [data-extension-key="topic-workflow"]')).toHaveCount(1);
  await expect(page.locator('#composerRoot [data-extension-key="chat-workflow"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__composerNodeForLifecycle === document.querySelector('#composerRoot .rich-composer-editor'))).toBe(true);

  await page.evaluate(() => window.__testActivateMainView('chatView'));
  await expect(editor).toContainText('chat draft');
  await expect(page.locator('#composerRoot [data-extension-key="chat-workflow"]')).toHaveCount(1);
  await expect(page.locator('#composerRoot [data-extension-key="topic-workflow"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__composerNodeForLifecycle === document.querySelector('#composerRoot .rich-composer-editor'))).toBe(true);

  await page.evaluate(() => window.startNewChat());
  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(editor).toHaveText('');
  await expect(page.locator('#composerRoot [data-composer-extension-token]')).toHaveCount(0);
  await page.evaluate(() => window.__testActivateMainView('chatView'));
  await expect(editor).toHaveText('');
});
