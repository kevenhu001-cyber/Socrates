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
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: '11111111-1111-4111-8111-111111111111' });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'visual-user', role: 'user', rawText: 'Explore Socratic learning', html: null }] });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    await window.askChatTurn('Explore Socratic learning');
  });

  // The live chat path replaced the agent-tool-card with a compact
  // inline status row (.tool-inline) mounted in the message flow so the
  // learner sees what the model is doing without tool-card chrome. The
  // stream here is fulfilled atomically, so by assertion time the row
  // has settled. Its label names the object of the call — the query —
  // and the source count lives in the meta span, so the row is
  // informative without expanding it.
  const toolRow = page.locator('.msg.assistant .tool-inline[data-tcid="search-visual"]');
  await expect(toolRow).toBeVisible();
  await expect(toolRow.locator('.tool-inline-label').first()).toHaveText('Searched "Socratic learning"');
  await expect(toolRow.locator('.tool-inline-meta')).toHaveText('2 sources');
  // tool-run-group and agent-tool-card are now share/history-only —
  // they must NOT be created in the live chat path.
  await expect(page.locator('.tool-run-group')).toHaveCount(0);
  await expect(page.locator('.agent-tool-card')).toHaveCount(0);
  const chatComposer = page.locator('#chatInputWrap');
  await expect(chatComposer.locator('.rich-composer-toolbar')).toBeHidden();
  const desktopComposerBox = await chatComposer.boundingBox();
  // The workbench content column is the shared 768px reading column.
  expect(desktopComposerBox?.width).toBeLessThanOrEqual(820);
  // Desktop composer is the compact two-row surface: a 40px editor row plus
  // a 40px control row (~98px with padding). It must never reach the
  // multiline two-tier height while the draft is a single line.
  expect(desktopComposerBox?.height).toBeLessThanOrEqual(112);
  const desktopControlBoxes = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element || getComputedStyle(element).display === 'none') return null;
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null;
    };
    return {
      attach: box('#chatInputWrap .attach-btn'),
      editor: box('#chatComposerRoot'),
      effort: box('#chatInputWrap .effort-picker'),
      mic: box('#chatMobileMicBtn'),
      send: box('#sendBtn'),
    };
  });
  /* Desktop matches ChatGPT's single rail: plus → editor → mic → send.
     Reasoning remains available in the tools surface instead of consuming
     permanent composer width. */
  expect(desktopControlBoxes.effort).toBeNull();
  expect(desktopControlBoxes.attach?.right ?? 0).toBeLessThanOrEqual((desktopControlBoxes.editor?.left ?? 0) + 1);
  expect(desktopControlBoxes.editor?.right ?? 0).toBeLessThanOrEqual((desktopControlBoxes.mic?.left ?? 0) + 1);
  expect(desktopControlBoxes.mic?.right ?? 0).toBeLessThanOrEqual((desktopControlBoxes.send?.left ?? 0) + 1);
  const editorCenter = ((desktopControlBoxes.editor?.top ?? 0) + (desktopControlBoxes.editor?.bottom ?? 0)) / 2;
  const attachCenter = ((desktopControlBoxes.attach?.top ?? 0) + (desktopControlBoxes.attach?.bottom ?? 0)) / 2;
  // Every one-row control shares the same optical center inside the pill.
  expect(Math.abs(editorCenter - attachCenter)).toBeLessThanOrEqual(1);
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
  /* The reference keeps the reasoning-effort pill visible at rest. */
  await expect(mobileComposer.locator('.effort-picker')).toBeVisible();
  const collapsedBox = await mobileComposer.boundingBox();
  /* The in-session mobile composer matches the landing (topic) card: a
     two-row surface (~104px) that only grows for a wrapped draft. */
  expect(collapsedBox?.height).toBeLessThanOrEqual(112);
  const collapsedGeometry = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!(el instanceof HTMLElement) || el.hidden || getComputedStyle(el).display === 'none') return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    return {
      left: rect('#chatInputWrap .footer-left-group'),
      editor: rect('#chatComposerRoot'),
      send: rect('#sendBtn'),
      bodyDisplay: getComputedStyle(document.querySelector('#chatInputWrap .chat-composer-body')).display,
      bodyColumns: getComputedStyle(document.querySelector('#chatInputWrap .chat-composer-body')).gridTemplateColumns,
    };
  });
  console.log('[mobile-collapsed-geometry]', JSON.stringify(collapsedGeometry));
  /* Two-row mobile card: the editor owns the first row and the attach rail
     sits under it, left of the primary action. */
  expect(['grid', 'contents']).toContain(collapsedGeometry.bodyDisplay);
  expect(collapsedGeometry.editor?.bottom ?? 0).toBeLessThanOrEqual((collapsedGeometry.send?.top ?? 0) + 1);
  await page.screenshot({ path: 'test-results/visual-qa/chat-composer-mobile-collapsed.png', fullPage: true });

  await mobileEditor.click();
  await expect(mobileComposer.locator('.effort-picker')).toBeVisible();
  // Focus is a state cue, not a layout jump. The same compact row stays in
  // place until the editor actually becomes multiline. The effort pill is
  // already visible at rest, matching the reference.
  await expect.poll(async () => (await mobileComposer.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual((collapsedBox?.height ?? 0) - 1);
  const focusedBox = await mobileComposer.boundingBox();
  const focusedEditorBox = await page.locator('#chatComposerRoot').boundingBox();
  /* The effort pill is already visible at rest, so focus only narrows the
     editor column while every control stays on the same row. */
  // The mobile rail keeps the reasoning control exposed, leaving a
  // compact but readable editor column at the 390px reference width.
  expect(focusedEditorBox?.width).toBeGreaterThanOrEqual(120);
  expect(focusedEditorBox?.right ?? 0).toBeLessThanOrEqual(focusedBox?.right ?? 0);
  /* Focus must not push the card out of its two-row height. */
  expect(focusedBox?.height ?? 999).toBeLessThanOrEqual(112);
  await page.screenshot({ path: 'test-results/visual-qa/chat-composer-mobile-focused.png', fullPage: true });

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  /* Blur does not re-hide the pill — the reference shows it at rest. */
  await expect(mobileComposer.locator('.effort-picker')).toBeVisible();
  await expect.poll(async () => (await mobileComposer.boundingBox())?.height ?? 0).toBeLessThanOrEqual(112);
});
