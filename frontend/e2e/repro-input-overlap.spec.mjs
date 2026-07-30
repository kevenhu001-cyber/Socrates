import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('measure composer and reserve - what is happening?', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'commit', timeout: 60000 });
  await waitForAppShell(page);

  await page.evaluate(() => {
    if (window.state) {
      window.state.phase = 'chat';
    } else {
      window.state = { phase: 'chat' };
    }
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
  });

  await page.waitForTimeout(500);

  const initial = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const bar = document.getElementById('chatInputBar');
    const wrap = document.getElementById('chatInputWrap');
    const view = document.getElementById('chatView');
    return {
      barHeight: bar.getBoundingClientRect().height,
      wrapHeight: wrap.getBoundingClientRect().height,
      barTop: bar.getBoundingClientRect().top,
      barBottom: bar.getBoundingClientRect().bottom,
      listPaddingBottom: Number.parseFloat(getComputedStyle(list).paddingBottom),
      cssVarHeight: getComputedStyle(view).getPropertyValue('--chat-input-bar-height'),
      cssReserve: getComputedStyle(view).getPropertyValue('--chat-content-bottom-reserve'),
      cssKeyboardInset: getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset'),
    };
  });
  console.log('Initial state:', JSON.stringify(initial, null, 2));

  // Now load a long answer and verify
  await page.evaluate(() => {
    for (let index = 0; index < 30; index += 1) {
      window.addMessage(
        index % 2 ? 'user' : 'assistant',
        `Answer paragraph ${index + 1}: this is content that should remain readable above the composer.`,
      );
    }
  });
  await page.waitForTimeout(300);

  const afterMessages = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const lastBody = list.querySelector('.msg:last-child .msg-body');
    const bar = document.getElementById('chatInputBar');
    return {
      barHeight: bar.getBoundingClientRect().height,
      barTop: bar.getBoundingClientRect().top,
      barBottom: bar.getBoundingClientRect().bottom,
      lastBodyTop: lastBody ? lastBody.getBoundingClientRect().top : null,
      lastBodyBottom: lastBody ? lastBody.getBoundingClientRect().bottom : null,
      listPaddingBottom: Number.parseFloat(getComputedStyle(list).paddingBottom),
      listScrollHeight: list.scrollHeight,
      listClientHeight: list.clientHeight,
      clearance: lastBody ? Math.round(bar.getBoundingClientRect().top - lastBody.getBoundingClientRect().bottom) : null,
    };
  });
  console.log('After messages (scroll not yet):', JSON.stringify(afterMessages, null, 2));

  // Scroll to bottom
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
  });
  await page.waitForTimeout(200);

  const afterScroll = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const lastBody = list.querySelector('.msg:last-child .msg-body');
    const bar = document.getElementById('chatInputBar');
    return {
      barHeight: bar.getBoundingClientRect().height,
      barTop: bar.getBoundingClientRect().top,
      barBottom: bar.getBoundingClientRect().bottom,
      lastBodyTop: lastBody ? lastBody.getBoundingClientRect().top : null,
      lastBodyBottom: lastBody ? lastBody.getBoundingClientRect().bottom : null,
      listScrollTop: list.scrollTop,
      clearance: lastBody ? Math.round(bar.getBoundingClientRect().top - lastBody.getBoundingClientRect().bottom) : null,
    };
  });
  console.log('After scroll:', JSON.stringify(afterScroll, null, 2));
});