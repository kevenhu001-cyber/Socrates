import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('capture composer and tool UI at desktop and mobile breakpoints', async ({ page }) => {
  await mockAuthedApp(page);
  await page.addInitScript(() => localStorage.setItem('socrates-reasoning-effort', 'high'));
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
  await page.locator('#composerRoot .rich-composer-editor').fill('How does the Socratic method improve learning?');
  await page.screenshot({ path: 'test-results/visual-qa/topic-dark.png', fullPage: true });

  await page.evaluate(async () => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: '11111111-1111-4111-8111-111111111111' });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'visual-user', role: 'user', rawText: 'Explore Socratic learning', html: null }] });
    window.__testActivateMainView('chatView');
    await window.askChatTurn('Explore Socratic learning');
  });

  await page.locator('.msg.assistant [data-testid="turn-activity-toggle"]').click();
  const toolRow = page.locator('.msg.assistant .rn-tool-row[data-tcid="search-visual"]');
  await expect(toolRow).toBeVisible();
  await expect(toolRow.locator('[data-testid="tool-row-verb"]')).toHaveText('Search the web');
  await expect(toolRow.locator('[data-testid="tool-row-target"]')).toHaveText('Socratic learning');
  await expect(toolRow.locator('[data-testid="tool-row-status"]')).toHaveText('Done');
  await expect(page.locator('.agent-tool-card')).toHaveCount(0);

  const chatComposer = page.locator('#composerInputWrap');
  await expect(chatComposer.locator('.rich-composer-toolbar')).toBeHidden();
  const desktopComposerBox = await chatComposer.boundingBox();
  expect(desktopComposerBox?.width).toBeLessThanOrEqual(820);
  expect(desktopComposerBox?.height).toBeLessThanOrEqual(112);

  /* Desktop keeps the primary rail quiet: + → prompt → mic → send. Model and
     reasoning stay one click away in the existing top-bar configuration
     trigger rather than occupying a permanent composer slot. */
  await expect(chatComposer.locator('[data-composer-control=effort]')).toBeHidden();
  await expect(page.locator('#topModelSwitcher')).toBeVisible();
  const desktopControlBoxes = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element || getComputedStyle(element).display === 'none') return null;
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null;
    };
    return {
      attach: box('#composerInputWrap #composerToolsBtn'),
      editor: box('#composerRoot .rich-composer-editor'),
      effort: box('#composerInputWrap [data-composer-control=effort]'),
      mic: box('#composerMicBtn'),
      send: box('#composerPrimaryBtn'),
    };
  });
  expect(desktopControlBoxes.effort).toBeNull();
  /* RN-7 ask-box: the editor is the top storey, the rail sits beneath it —
     + on the left, mic and send on the right, all on one centre line. */
  expect(desktopControlBoxes.editor?.bottom ?? 0).toBeLessThanOrEqual((desktopControlBoxes.attach?.top ?? 0) + 1);
  expect(desktopControlBoxes.attach?.right ?? 0).toBeLessThanOrEqual((desktopControlBoxes.mic?.left ?? 0) + 1);
  expect(desktopControlBoxes.mic?.right ?? 0).toBeLessThanOrEqual((desktopControlBoxes.send?.left ?? 0) + 1);
  const sendCenter = ((desktopControlBoxes.send?.top ?? 0) + (desktopControlBoxes.send?.bottom ?? 0)) / 2;
  const attachCenter = ((desktopControlBoxes.attach?.top ?? 0) + (desktopControlBoxes.attach?.bottom ?? 0)) / 2;
  expect(Math.abs(sendCenter - attachCenter)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/visual-qa/chat-composer-dark.png', fullPage: true });
  await page.evaluate(() => document.getElementById('themeToggle')?.click?.());
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/visual-qa/chat-tools-light.png', fullPage: true });

  await page.evaluate(() => document.getElementById('themeToggle')?.click?.());
  await page.waitForTimeout(250);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) window.__socratesLegacy.navigation.toggleSidebar?.();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.waitForTimeout(400);
  const mobileComposer = page.locator('#composerInputWrap');
  const mobileEditor = page.locator('#composerRoot .rich-composer-editor');
  await expect(mobileComposer.locator('.rich-composer-toolbar')).toBeHidden();
  /* Non-default reasoning stays directly visible on phones. */
  await expect(mobileComposer.locator('[data-composer-control=effort]')).toBeVisible();
  const collapsedBox = await mobileComposer.boundingBox();
  expect(collapsedBox?.height).toBeLessThanOrEqual(112);
  const collapsedGeometry = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!(el instanceof HTMLElement) || el.hidden || getComputedStyle(el).display === 'none') return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    return {
      left: rect('#composerInputWrap #composerToolsBtn'),
      editor: rect('#composerInputWrap .rich-composer-editor'),
      send: rect('#composerPrimaryBtn'),
      bodyDisplay: getComputedStyle(document.querySelector('#composerInputWrap [data-composer-slot="rail"]')).display,
    };
  });
  console.log('[mobile-collapsed-geometry]', JSON.stringify(collapsedGeometry));
  expect(['contents', 'grid', 'flex']).toContain(collapsedGeometry.bodyDisplay);
  expect((collapsedGeometry.send?.top ?? 0)).toBeGreaterThanOrEqual((collapsedGeometry.editor?.bottom ?? 0) - 8);
  await page.screenshot({ path: 'test-results/visual-qa/chat-composer-mobile-collapsed.png', fullPage: true });

  await mobileEditor.click();
  await expect(mobileComposer.locator('[data-composer-control=effort]')).toBeVisible();
  await expect.poll(async () => (await mobileComposer.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual((collapsedBox?.height ?? 0) - 1);
  const focusedBox = await mobileComposer.boundingBox();
  const focusedEditorBox = await page.locator('#composerInputWrap .rich-composer-editor').boundingBox();
  expect(focusedEditorBox?.width).toBeGreaterThanOrEqual(96);
  expect(focusedEditorBox?.right ?? 0).toBeLessThanOrEqual(focusedBox?.right ?? 0);
  expect(focusedBox?.height ?? 999).toBeLessThanOrEqual(112);
  await page.screenshot({ path: 'test-results/visual-qa/chat-composer-mobile-focused.png', fullPage: true });

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await expect(mobileComposer.locator('[data-composer-control=effort]')).toBeVisible();
  await expect.poll(async () => (await mobileComposer.boundingBox())?.height ?? 0).toBeLessThanOrEqual(112);
});
