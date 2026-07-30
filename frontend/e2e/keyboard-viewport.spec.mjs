import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { getKeyboardInset, isTrackedInputFocused } from '../src/ui/keyboardViewport.js';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('normalizes virtual-keyboard measurements without double-counting layout resize', () => {
  // Overlay keyboard (Chrome, Safari): the layout viewport stays full height.
  expect(getKeyboardInset(844, 510, 0)).toBe(334);
  // Resizing keyboard mode (Firefox/Android): CSS dvh already moved the app.
  expect(getKeyboardInset(510, 510, 0)).toBe(0);
  // Panned Visual Viewport: offsetTop must reduce the calculated inset.
  expect(getKeyboardInset(844, 560, 24)).toBe(260);
  expect(getKeyboardInset(844, undefined)).toBe(0);
});

test('recognizes focus inside the nested rich-composer editor', () => {
  const nestedEditor = {};
  const composerRoot = {
    contains(node) { return node === nestedEditor; },
    matches() { return false; },
  };
  expect(isTrackedInputFocused([composerRoot], nestedEditor)).toBe(true);
  expect(isTrackedInputFocused([composerRoot], {})).toBe(false);
});

test('composer and message reserve follow the normalized keyboard inset on mobile', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.state.phase = 'chat';
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
  });

  const composer = page.locator('#chatInputBar');
  const messages = page.locator('#msgList');
  const before = await composer.boundingBox();
  expect(before).not.toBeNull();

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--keyboard-inset', '300px');
  });

  const after = await composer.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.round(before.y - after.y)).toBe(300);
  const reserve = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const bar = document.getElementById('chatInputBar');
    return {
      paddingBottom: Number.parseFloat(getComputedStyle(list).paddingBottom),
      barHeight: bar.getBoundingClientRect().height,
    };
  });
  expect(reserve.paddingBottom).toBeGreaterThanOrEqual(reserve.barHeight + 300 + 8);
  expect(after.y + after.height).toBeLessThanOrEqual(544);

  await page.evaluate(() => {
    window.addMessage('assistant', 'The final answer line must remain fully above the composer.');
  });
  await expect(messages).toContainText('The final answer line must remain fully above the composer.');
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
  });
  await page.waitForTimeout(100);

  const clearance = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const lastBody = list.querySelector('.msg.assistant:last-child .msg-body');
    const bar = document.getElementById('chatInputBar');
    return Math.round(bar.getBoundingClientRect().top - lastBody.getBoundingClientRect().bottom);
  });
  expect(clearance).toBeGreaterThanOrEqual(8);
});

test('expanding the mobile composer keeps the latest message pinned and unobscured', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.state.phase = 'chat';
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    for (let index = 0; index < 18; index += 1) {
      window.addMessage(
        'assistant',
        `Pinned reply ${index + 1}: the complete line must stay above the expanding composer.`,
      );
    }
  });
  await expect(page.locator('#msgList')).toContainText('Pinned reply 18');

  const before = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const bar = document.getElementById('chatInputBar');
    list.scrollTop = list.scrollHeight;
    window.state._userScrolledAway = false;
    return { barHeight: bar.getBoundingClientRect().height };
  });

  await page.locator('#chatComposerRoot .rich-composer-editor').first().focus();
  await page.waitForTimeout(450);

  const after = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const bar = document.getElementById('chatInputBar');
    const lastBody = list.querySelector('.msg.assistant:last-child .msg-body');
    return {
      barHeight: bar.getBoundingClientRect().height,
      paddingBottom: Number.parseFloat(getComputedStyle(list).paddingBottom),
      distanceFromBottom: Math.round(list.scrollHeight - list.scrollTop - list.clientHeight),
      clearance: Math.round(bar.getBoundingClientRect().top - lastBody.getBoundingClientRect().bottom),
    };
  });

  expect(after.barHeight).toBeGreaterThan(before.barHeight);
  expect(after.paddingBottom).toBeGreaterThanOrEqual(after.barHeight + 8);
  expect(after.distanceFromBottom).toBeLessThanOrEqual(2);
  expect(after.clearance).toBeGreaterThanOrEqual(8);
});

test('desktop answer bottom remains above the composer', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.state.phase = 'chat';
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.addMessage(
      'assistant',
      Array.from(
        { length: 24 },
        (_, index) => `Answer paragraph ${index + 1}: content remains readable above the composer.`,
      ).join('\n\n'),
    );
  });
  await expect(page.locator('#msgList')).toContainText('Answer paragraph 24');
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
  });

  const geometry = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const lastBody = list.querySelector('.msg.assistant:last-child .msg-body');
    const bar = document.getElementById('chatInputBar');
    return {
      clearance: Math.round(
        bar.getBoundingClientRect().top - lastBody.getBoundingClientRect().bottom,
      ),
      paddingBottom: Number.parseFloat(getComputedStyle(list).paddingBottom),
      barHeight: bar.getBoundingClientRect().height,
    };
  });
  expect(geometry.paddingBottom).toBeGreaterThanOrEqual(geometry.barHeight + 8);
  expect(geometry.clearance).toBeGreaterThanOrEqual(8);
});
