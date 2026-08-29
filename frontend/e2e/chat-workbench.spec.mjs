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
  await expect(page.locator('#msgList')).toHaveAttribute('data-react-migration-runtime', 'msg-list');

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
      assistantLineHeight: Math.round(parseFloat(assistantStyle?.lineHeight || '0')),
      toolbarHeight: Math.round(toolbar?.getBoundingClientRect().height || 0),
    };
  });
  expect(messageLayout.contentMax).toBe('820px');
  expect(messageLayout.rowWidth).toBeLessThanOrEqual(822);
  expect(messageLayout.userWidth).toBeLessThan(messageLayout.rowWidth);
  expect(Math.abs(messageLayout.userRightGap)).toBeLessThanOrEqual(1);
  expect(messageLayout.userRadius).toBe(15);
  expect(messageLayout.userBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(messageLayout.assistantBackground).toBe('rgba(0, 0, 0, 0)');
  expect(messageLayout.assistantFontSize).toBe(15);
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
  /* 24px is the composer's designed radius across all five of its
     breakpoint rules; the 18 this used to assert predates that pass. */
  expect(composed.wrapRadius).toBe(24);
  expect(composed.wrapBorder).not.toBe('0px');
  expect(composed.sendSize).toBe(38);
  expect(composed.attachSize).toBe(38);
  expect(composed.messageCount).toBe(initial.messageCount);
});

test('mobile chat workbench keeps a focusable multiline composer without horizontal overflow', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: BASE_MESSAGES, viewport: WORKBENCH_VIEWPORTS.mobile });

  const editor = page.locator('#chatComposerRoot .rich-composer-editor');
  const wrap = page.locator('#chatInputWrap');
  await expect(page.locator('#msgList')).toBeVisible();
  await expect(editor).toBeVisible();
  const collapsedHeight = await wrap.evaluate((node) => node.getBoundingClientRect().height);
  await editor.focus();
  await editor.fill('Mobile line one');
  await editor.press('Shift+Enter');
  await editor.type('Mobile line two');
  await expect(wrap).toHaveClass(/composer-focused/);
  await page.waitForTimeout(220);

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
  expect(mobileComposer.focusedHeight).toBeGreaterThan(collapsedHeight + 24);
  expect(mobileComposer.fontSize).toBe(16);
  expect(mobileComposer.sendSize).toBeGreaterThanOrEqual(40);
  expect(mobileComposer.attachSize).toBeGreaterThanOrEqual(40);
  expect(mobileComposer.activeEditor).toBe(true);
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
