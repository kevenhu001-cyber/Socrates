import { expect, test } from '@playwright/test';
import {
  WORKBENCH_VIEWPORTS,
  completeFrame,
  namedFrame,
  prepareChatWorkbench,
  snapshotWorkbenchGeometry,
  textFrame,
} from './_chat-workbench.mjs';

const BASE_MESSAGES = [
  { clientId: 'fixture-user', role: 'user', rawText: 'Build a compact workbench.', html: '<p>Build a compact workbench.</p>', type: 'user' },
  { clientId: 'fixture-assistant', role: 'assistant', rawText: 'The workbench is ready.', html: '<p>The workbench is ready.</p>', type: 'assistant' },
];

test('desktop chat workbench keeps shell, transcript and composer in one viewport', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: BASE_MESSAGES, viewport: WORKBENCH_VIEWPORTS.desktop });

  await expect(page.locator('#sidebar')).toBeVisible();
  await expect(page.locator('.top-bar')).toBeVisible();
  await expect(page.locator('#msgList')).toBeVisible();
  await expect(page.locator('#chatInputWrap')).toBeVisible();
  await expect(page.locator('#msgList')).toHaveAttribute('data-mounted-by', 'msg-list');

  const geometry = await snapshotWorkbenchGeometry(page);
  expect(geometry.app).not.toBeNull();
  expect(geometry.app.height).toBe(WORKBENCH_VIEWPORTS.desktop.height);
  expect(geometry.transcript.bottom).toBeLessThanOrEqual(geometry.composer.top + 2);
  expect(geometry.composer.width).toBeLessThanOrEqual(930);
  expect(geometry.overflow).toBeLessThanOrEqual(0);

  const contract = await page.evaluate(() => {
    const shell = document.getElementById('appShell');
    const shellStyle = getComputedStyle(shell);
    const sidebarStyle = getComputedStyle(document.getElementById('sidebar'));
    const topbarStyle = getComputedStyle(document.querySelector('.top-bar'));
    const mainBackgroundStyle = getComputedStyle(document.querySelector('.main-bg'));
    return {
      page: shellStyle.getPropertyValue('--workbench-page').trim(),
      surface: shellStyle.getPropertyValue('--workbench-surface').trim(),
      mainBackgroundImage: mainBackgroundStyle.backgroundImage,
      sidebarBackground: sidebarStyle.backgroundColor,
      sidebarBorder: sidebarStyle.borderRightWidth,
      topbarHeight: Math.round(parseFloat(topbarStyle.minHeight)),
    };
  });
  expect(contract.page).not.toBe('');
  expect(contract.surface).not.toBe('');
  expect(contract.mainBackgroundImage).toBe('none');
  expect(contract.sidebarBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(contract.sidebarBorder).not.toBe('0px');
  expect(contract.topbarHeight).toBeGreaterThanOrEqual(50);

  const messageLayout = await page.evaluate(() => {
    const shell = document.getElementById('appShell');
    const row = document.querySelector('#msgList .msg.user');
    const userBody = row?.querySelector('.msg-body');
    const assistantBody = document.querySelector('#msgList .msg.assistant .msg-body');
    const toolbar = document.querySelector('#msgList .msg-toolbar');
    const rowRect = row?.getBoundingClientRect();
    const userRect = userBody?.getBoundingClientRect();
    const assistantStyle = assistantBody ? getComputedStyle(assistantBody) : null;
    const userStyle = userBody ? getComputedStyle(userBody) : null;
    return {
      contentMax: getComputedStyle(shell).getPropertyValue('--workbench-content-max').trim(),
      rowWidth: Math.round(rowRect?.width || 0),
      userWidth: Math.round(userRect?.width || 0),
      userRightGap: Math.round((rowRect?.right || 0) - (userRect?.right || 0)),
      userRadius: Math.round(parseFloat(userStyle?.borderRadius || '0')),
      userBackground: userStyle?.backgroundColor,
      assistantBackground: assistantStyle?.backgroundColor,
      assistantFontSize: Math.round(parseFloat(assistantStyle?.fontSize || '0')),
      fontScale: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-font-scale')) || 1,
      assistantLineHeight: Math.round(parseFloat(assistantStyle?.lineHeight || '0')),
      toolbarHeight: Math.round(toolbar?.getBoundingClientRect().height || 0),
    };
  });
  /* The canonical reading column is 768px; CSS preserves the calc() token
     so the user width scale can adjust it without another test rewrite. */
  expect(messageLayout.contentMax).toContain('768px');
  expect(messageLayout.rowWidth).toBeLessThanOrEqual(822);
  expect(messageLayout.userWidth).toBeLessThan(messageLayout.rowWidth);
  expect(Math.abs(messageLayout.userRightGap)).toBeLessThanOrEqual(1);
  expect(messageLayout.userRadius).toBe(15);
  expect(messageLayout.userBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(messageLayout.assistantBackground).toBe('rgba(0, 0, 0, 0)');
  /* The display preference intentionally ships at 1.125×, so the 15px
     workbench base renders as 17px. Keep the assertion tied to that token
     instead of freezing the test to one preference value. */
  expect(messageLayout.assistantFontSize).toBe(Math.round(15 * messageLayout.fontScale));
  expect(messageLayout.assistantLineHeight).toBeGreaterThanOrEqual(24);
  expect(messageLayout.toolbarHeight).toBeLessThanOrEqual(28);
});

test('desktop composer keeps focus and grows for multiline input without submitting', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: BASE_MESSAGES, viewport: WORKBENCH_VIEWPORTS.desktop });

  const editor = page.locator('#chatComposerRoot .rich-composer-editor');
  const wrap = page.locator('#chatInputWrap');
  const initial = await editor.evaluate((node) => ({
    editorHeight: node.getBoundingClientRect().height,
    messageCount: document.querySelectorAll('#msgList > .msg').length,
  }));

  await editor.focus();
  await expect(wrap).toHaveClass(/composer-focused/);
  await editor.fill('First workbench line');
  await editor.press('Shift+Enter');
  await editor.type('Second workbench line');
  await expect(editor).toContainText('First workbench line');
  await expect(editor).toContainText('Second workbench line');
  await page.waitForTimeout(220);

  const composed = await page.evaluate(() => {
    const wrapNode = document.getElementById('chatInputWrap');
    const editorNode = document.querySelector('#chatComposerRoot .rich-composer-editor');
    const send = document.getElementById('sendBtn');
    const attach = document.getElementById('chatComposerToolsBtn');
    const wrapStyle = getComputedStyle(wrapNode);
    return {
      activeEditor: document.activeElement === editorNode,
      editorHeight: Math.round(editorNode.getBoundingClientRect().height),
      wrapRadius: Math.round(parseFloat(wrapStyle.borderRadius)),
      wrapBorder: wrapStyle.borderTopWidth,
      sendSize: Math.round(send.getBoundingClientRect().width),
      attachSize: Math.round(attach.getBoundingClientRect().width),
      messageCount: document.querySelectorAll('#msgList > .msg').length,
    };
  });
  expect(composed.activeEditor).toBe(true);
  expect(composed.editorHeight).toBeGreaterThan(initial.editorHeight);
  expect(composed.editorHeight).toBeLessThanOrEqual(280);
  /* Conversation and landing now share the same compact desktop shell. */
  expect(composed.wrapRadius).toBe(26);
  expect(composed.wrapBorder).not.toBe('0px');
  expect(composed.sendSize).toBe(30);
  expect(composed.attachSize).toBe(44);
  expect(composed.messageCount).toBe(initial.messageCount);
});

test('mobile chat workbench keeps a focusable multiline composer without horizontal overflow', async ({ page }) => {
  await prepareChatWorkbench(page, {
    messages: BASE_MESSAGES,
    viewport: WORKBENCH_VIEWPORTS.mobile,
    streamBody: [textFrame('Sent without changing the composer surface.'), completeFrame()].join(''),
  });

  const editor = page.locator('#chatComposerRoot .rich-composer-editor');
  const wrap = page.locator('#chatInputWrap');
  await expect(page.locator('#msgList')).toBeVisible();
  await expect(editor).toBeVisible();
  const initial = await wrap.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      height: node.getBoundingClientRect().height,
      width: node.getBoundingClientRect().width,
      background: style.backgroundColor,
      radius: style.borderRadius,
      pageBackground: getComputedStyle(document.querySelector('.main-content')).backgroundColor,
    };
  });
  await editor.focus();
  await editor.fill('Mobile line one');
  await expect(wrap).toHaveClass(/composer-focused/);
  await expect(wrap).not.toHaveClass(/composer-multiline/);
  await page.waitForTimeout(80);
  const singleLineHeight = await wrap.evaluate((node) => node.getBoundingClientRect().height);
  expect(Math.abs(singleLineHeight - initial.height)).toBeLessThanOrEqual(2);

  await editor.press('Shift+Enter');
  await editor.type('Mobile line two');
  await expect(wrap).toHaveClass(/composer-multiline/);
  const animatedHeights = [];
  for (const delay of [35, 55, 75, 110]) {
    await page.waitForTimeout(delay);
    animatedHeights.push(await wrap.evaluate((node) => node.getBoundingClientRect().height));
  }
  for (let index = 1; index < animatedHeights.length; index += 1) {
    expect(animatedHeights[index]).toBeGreaterThanOrEqual(animatedHeights[index - 1] - 1);
  }

  const geometry = await snapshotWorkbenchGeometry(page);
  const mobileComposer = await page.evaluate(() => {
    const wrapNode = document.getElementById('chatInputWrap');
    const editorNode = document.querySelector('#chatComposerRoot .rich-composer-editor');
    const send = document.getElementById('sendBtn');
    const attach = document.getElementById('chatComposerToolsBtn');
    return {
      focusedHeight: Math.round(wrapNode.getBoundingClientRect().height),
      fontSize: Math.round(parseFloat(getComputedStyle(editorNode).fontSize)),
      sendSize: Math.round(send.getBoundingClientRect().width),
      attachSize: Math.round(attach.getBoundingClientRect().width),
      activeEditor: document.activeElement === editorNode,
    };
  });
  expect(geometry.app.height).toBe(WORKBENCH_VIEWPORTS.mobile.height);
  expect(geometry.composer.width).toBeLessThanOrEqual(WORKBENCH_VIEWPORTS.mobile.width);
  expect(geometry.overflow).toBeLessThanOrEqual(0);
  expect(mobileComposer.focusedHeight).toBeGreaterThanOrEqual(initial.height + 24);
  expect(mobileComposer.fontSize).toBe(16);
  expect(mobileComposer.sendSize).toBe(36);
  expect(mobileComposer.attachSize).toBe(44);
  expect(mobileComposer.activeEditor).toBe(true);

  /* A soft wrap used to oscillate: expanding gives the editor a wider first
     row, which made the same draft look single-line and collapse again. */
  await editor.fill('Short');
  await expect(wrap).not.toHaveClass(/composer-multiline/);
  await page.evaluate(() => {
    const wrapNode = document.getElementById('chatInputWrap');
    window.__composerShapeTransitions = [];
    window.__composerShapeObserver = new MutationObserver(() => {
      window.__composerShapeTransitions.push(wrapNode.classList.contains('composer-multiline'));
    });
    window.__composerShapeObserver.observe(wrapNode, { attributes: true, attributeFilter: ['class'] });
  });
  await editor.fill('This sentence is intentionally long enough to wrap naturally inside the compact mobile composer without an explicit newline.');
  await expect(wrap).toHaveClass(/composer-multiline/);
  await page.waitForTimeout(500);
  const shapeTransitions = await page.evaluate(() => {
    window.__composerShapeObserver?.disconnect();
    return window.__composerShapeTransitions;
  });
  expect(shapeTransitions.filter((expanded) => expanded).length).toBe(1);
  expect(shapeTransitions.at(-1)).toBe(true);

  await editor.fill('Send this single line');
  await expect(wrap).not.toHaveClass(/composer-multiline/);
  await page.waitForTimeout(360);
  await editor.press('Enter');
  await expect(page.locator('#msgList .msg.assistant').last()).toContainText('Sent without changing');
  const afterSend = await wrap.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      height: node.getBoundingClientRect().height,
      width: node.getBoundingClientRect().width,
      background: style.backgroundColor,
      radius: style.borderRadius,
      pageBackground: getComputedStyle(document.querySelector('.main-content')).backgroundColor,
    };
  });
  expect(afterSend.height).toBeCloseTo(initial.height, 0);
  expect(afterSend.width).toBeCloseTo(initial.width, 0);
  expect(afterSend.background).toBe(initial.background);
  expect(afterSend.radius).toBe(initial.radius);
  expect(afterSend.pageBackground).toBe(initial.pageBackground);
});

test('deterministic tool fixture preserves one durable row and finalized answer', async ({ page }) => {
  const streamBody = [
    namedFrame('tool_use', [{ id: 'fixture-search', name: 'web_search', input: { query: 'Socrates' } }]),
    namedFrame('tool_result', { id: 'fixture-search', name: 'web_search', ok: true, durationMs: 420, results: [{ title: 'Source', url: 'https://example.test/source' }] }),
    textFrame('A deterministic response.'),
    completeFrame(),
  ].join('');
  await prepareChatWorkbench(page, {
    messages: [{ clientId: 'fixture-user', role: 'user', rawText: 'Search', html: '<p>Search</p>', type: 'user' }],
    streamBody,
  });

  await page.evaluate(() => window.askChatTurn('Search'));
  const answer = page.locator('#msgList .msg.assistant').last();
  await expect(answer).toContainText('A deterministic response.');
  await expect(answer.locator('.tool-inline[data-tcid="fixture-search"]')).toHaveCount(1);
  await expect(answer.locator('.tool-inline[data-tcid="fixture-search"]')).toHaveAttribute('data-state', 'done');
});
