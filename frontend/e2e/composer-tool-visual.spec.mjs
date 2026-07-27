import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('capture composer and tool UI at desktop and mobile breakpoints', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route('**/api/**/chat/stream', async (route) => {
    const stream = [
      'event: tool_use\ndata: [{"id":"search-visual","name":"web_search","input":{"query":"Socratic learning"}}]\n\n',
      'event: tool_result\ndata: {"id":"search-visual","ok":true,"status":"completed","output":"Two relevant sources","results":[{"title":"Socratic method overview","url":"https://example.test/socratic","snippet":"Question-led learning encourages reflection."},{"title":"Active learning guide","url":"https://example.test/active","snippet":"Learners explain and test their own reasoning."}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Here is a concise synthesis of the sources."}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator('#topicComposerRoot .rich-composer-editor').fill('How does the Socratic method improve learning?');
  await page.screenshot({ path: 'test-results/visual-qa/topic-dark.png', fullPage: true });

  await page.evaluate(async () => {
    window.state.phase = 'chat';
    window.state.currentSessionId = '11111111-1111-4111-8111-111111111111';
    window.state.messages = [{ clientId: 'visual-user', role: 'user', rawText: 'Explore Socratic learning', html: null }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    await window.askChatTurn('Explore Socratic learning');
  });

  // The live chat path replaced the agent-tool-card with an inline
  // status label (Searching/Coding/Data Processing) so the learner
  // sees what the model is doing without tool-card chrome. Verify
  // the label appears during the tool_use event and disappears once
  // the assistant reply starts streaming.
  const thinkingStatus = page.locator('.msg.assistant .thinking-status');
  await expect(thinkingStatus).toBeVisible();
  await expect(thinkingStatus.locator('.thinking-status-label')).toContainText(/Searching|Coding|Working/i);
  // tool-run-group and agent-tool-card are now share/history-only —
  // they must NOT be created in the live chat path.
  await expect(page.locator('.tool-run-group')).toHaveCount(0);
  await expect(page.locator('.agent-tool-card')).toHaveCount(0);
  const chatComposer = page.locator('#chatInputWrap');
  await expect(chatComposer.locator('.rich-composer-toolbar')).toBeHidden();
  const desktopComposerBox = await chatComposer.boundingBox();
  expect(desktopComposerBox?.width).toBeLessThanOrEqual(800);
  expect(desktopComposerBox?.height).toBeLessThanOrEqual(72);
  const desktopControlBoxes = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null;
    };
    return {
      attach: box('#chatInputWrap .attach-btn'),
      editor: box('#chatComposerRoot'),
      effort: box('#chatInputWrap .effort-picker'),
      send: box('#sendBtn'),
    };
  });
  expect(desktopControlBoxes.attach?.right).toBeLessThanOrEqual(desktopControlBoxes.editor?.left ?? 0);
  expect(desktopControlBoxes.editor?.right).toBeLessThanOrEqual(desktopControlBoxes.effort?.left ?? 0);
  expect(desktopControlBoxes.effort?.right).toBeLessThanOrEqual(desktopControlBoxes.send?.left ?? 0);
  await page.screenshot({ path: 'test-results/visual-qa/chat-composer-dark.png', fullPage: true });
  await page.evaluate(() => window.toggleTheme?.());
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/visual-qa/chat-tools-light.png', fullPage: true });

  await page.evaluate(() => window.toggleTheme?.());
  await page.waitForTimeout(250);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) window.toggleSidebar?.();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.waitForTimeout(400);
  const mobileComposer = page.locator('#chatInputWrap');
  const mobileEditor = page.locator('#chatComposerRoot .rich-composer-editor');
  await expect(mobileComposer.locator('.rich-composer-toolbar')).toBeHidden();
  await expect(mobileComposer.locator('.effort-picker')).toBeHidden();
  const collapsedBox = await mobileComposer.boundingBox();
  expect(collapsedBox?.height).toBeLessThanOrEqual(66);
  await page.screenshot({ path: 'test-results/visual-qa/chat-composer-mobile-collapsed.png', fullPage: true });

  await mobileEditor.click();
  await expect(mobileComposer.locator('.effort-picker')).toBeVisible();
  const focusedBox = await mobileComposer.boundingBox();
  const focusedEditorBox = await page.locator('#chatComposerRoot').boundingBox();
  expect(focusedBox?.height).toBeGreaterThanOrEqual(110);
  expect(focusedEditorBox?.width).toBeGreaterThanOrEqual((focusedBox?.width ?? 0) - 20);
  await page.screenshot({ path: 'test-results/visual-qa/chat-composer-mobile-focused.png', fullPage: true });

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await expect(mobileComposer.locator('.effort-picker')).toBeHidden();
  await expect.poll(async () => (await mobileComposer.boundingBox())?.height ?? 0).toBeLessThanOrEqual(66);
});
