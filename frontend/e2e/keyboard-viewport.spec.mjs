import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { getKeyboardInset, isTrackedInputFocused, measureKeyboardInset } from '../src/ui/keyboardViewport.js';
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

test('measures against the app shell bottom so every keyboard mode gets the exact height', () => {
  // Overlay mode (iOS Safari, Chrome/Edge Android 108+): the shell stays
  // at full height while the visual viewport shrinks under the keyboard.
  expect(measureKeyboardInset(844, { height: 510, offsetTop: 0 }, 844)).toBe(334);
  // Resize mode (Firefox Android, Capacitor Keyboard.resize:"native"):
  // 100dvh already shrank the shell — the inset must NOT be added again.
  expect(measureKeyboardInset(510, { height: 510, offsetTop: 0 }, 510)).toBe(0);
  // Panned visual viewport: offsetTop reduces the obscured region.
  expect(measureKeyboardInset(844, { height: 560, offsetTop: 24 }, 844)).toBe(260);
  // Legacy WebView without VisualViewport: a stuck-100vh shell paired with
  // a shrunken innerHeight still yields the true keyboard height…
  expect(measureKeyboardInset(844, null, 510)).toBe(334);
  // …while an overlay keyboard is invisible there and degrades to 0.
  expect(measureKeyboardInset(844, null, 844)).toBe(0);
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

test('in-flow composer and transcript follow the normalized keyboard inset on mobile', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await expect(page.locator('#agentModeBtn')).toHaveCount(0);

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
  });

  const composer = page.locator('#chatInputBar');
  const messages = page.locator('#msgList');
  const before = await composer.boundingBox();
  expect(before).not.toBeNull();

  await page.evaluate(() => {
    for (let index = 0; index < 16; index += 1) {
      window.addMessage(
        index % 2 ? 'assistant' : 'user',
        `Keyboard inset history ${index + 1}: enough content to keep the mobile transcript scrollable.`,
      );
    }
  });
  await expect(page.locator('#msgList .msg')).toHaveCount(16);
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
    window.stateStore.dispatch({ type: "state/set", key: "_userScrolledAway", value: false });
    document.documentElement.style.setProperty('--keyboard-inset', '0px');
  });
  await page.waitForTimeout(350);
  const settledBefore = await composer.boundingBox();
  expect(settledBefore).not.toBeNull();

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--keyboard-inset', '300px');
  });
  await page.waitForTimeout(450);

  const after = await composer.boundingBox();
  expect(after).not.toBeNull();
  /* The bar's top edge rises by the inset minus the resting safe-area
     padding the keyboard consumes (16px -> 8px optical floor): the card
     keeps an 8px gap above the keyboard instead of covering it. The 6px
     breathing margin on .chat-view is already 0 here because the seeded
     messages set data-conversation-active. */
  expect(Math.round(settledBefore.y - after.y)).toBe(300 - 8);
  const geometry = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const bar = document.getElementById('chatInputBar');
    const listRect = list.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    return {
      paddingBottom: Number.parseFloat(getComputedStyle(list).paddingBottom),
      listBottom: Math.round(listRect.bottom),
      barTop: Math.round(barRect.top),
      barPosition: getComputedStyle(bar).position,
      appVh: document.documentElement.style.getPropertyValue('--app-vh'),
      measuredBarHeight: getComputedStyle(document.getElementById('chatView'))
        .getPropertyValue('--chat-input-bar-height'),
      distanceFromBottom: Math.round(list.scrollHeight - list.scrollTop - list.clientHeight),
    };
  });
  expect(geometry.paddingBottom).toBe(0);
  expect(geometry.barPosition).toBe('relative');
  expect(geometry.appVh).toBe('');
  expect(geometry.measuredBarHeight).toBe('');
  expect(geometry.listBottom).toBeLessThanOrEqual(geometry.barTop);
  expect(geometry.distanceFromBottom).toBeLessThanOrEqual(2);
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

test('mobile composer follows a keyboard inset continuously without a position flash', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    document.documentElement.style.setProperty('--keyboard-inset', '0px');
  });
  await page.waitForTimeout(350);
  const start = await page.locator('#chatInputBar').boundingBox();
  expect(start).not.toBeNull();

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--keyboard-inset', '260px');
  });
  const samples = [];
  for (const delay of [35, 70, 120, 190, 300, 390]) {
    await page.waitForTimeout(delay);
    const box = await page.locator('#chatInputBar').boundingBox();
    expect(box).not.toBeNull();
    samples.push(box.y);
  }

  expect(samples[0]).toBeLessThan(start.y);
  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index]).toBeLessThanOrEqual(samples[index - 1] + 1);
  }
  /* Same consumption as above, plus the 6px .chat-view breathing margin:
     no messages were seeded, so data-conversation-active is off and the
     resting margin collapses into the lift as well (260 - 8 - 6). */
  expect(Math.round(start.y - samples[samples.length - 1])).toBe(246);
});

test('a second input line expands the mobile composer and keeps the latest message unobscured', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
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
    window.stateStore.dispatch({ type: "state/set", key: "_userScrolledAway", value: false });
    return { barHeight: bar.getBoundingClientRect().height };
  });

  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await editor.focus();
  await editor.fill('First line');
  await page.waitForTimeout(80);
  const focusedSingleLine = await page.locator('#chatInputBar').evaluate((node) => node.getBoundingClientRect().height);
  expect(Math.abs(focusedSingleLine - before.barHeight)).toBeLessThanOrEqual(2);
  await editor.press('Shift+Enter');
  await editor.type('Second line');
  await expect(page.locator('#chatInputWrap')).toHaveClass(/composer-multiline/);
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
      listBottom: Math.round(list.getBoundingClientRect().bottom),
      barTop: Math.round(bar.getBoundingClientRect().top),
    };
  });

  expect(after.barHeight).toBeGreaterThan(before.barHeight);
  expect(after.paddingBottom).toBe(0);
  expect(after.listBottom).toBeLessThanOrEqual(after.barTop);
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
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
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
      listBottom: Math.round(list.getBoundingClientRect().bottom),
      barTop: Math.round(bar.getBoundingClientRect().top),
    };
  });
  expect(geometry.paddingBottom).toBe(0);
  expect(geometry.listBottom).toBeLessThanOrEqual(geometry.barTop);
  expect(geometry.clearance).toBeGreaterThanOrEqual(8);
});

test('conversation transcript remains independently scrollable', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    for (let index = 0; index < 32; index += 1) {
      window.addMessage(
        index % 2 ? 'assistant' : 'user',
        `Scrollable history ${index + 1}: ${'conversation content '.repeat(8)}`,
      );
    }
  });
  await expect(page.locator('#msgList .msg')).toHaveCount(32);

  const transcript = page.locator('#msgList');
  const geometry = await transcript.evaluate((list) => {
    list.scrollTop = list.scrollHeight;
    return {
      parentId: list.parentElement?.id,
      overflowY: getComputedStyle(list).overflowY,
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight,
      bottomScrollTop: list.scrollTop,
    };
  });

  expect(geometry.parentId).toBe('mainContent');
  expect(geometry.overflowY).toBe('auto');
  expect(geometry.clientHeight).toBeGreaterThan(0);
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
  expect(geometry.bottomScrollTop).toBeGreaterThan(0);

  await transcript.hover();
  await page.mouse.wheel(0, -500);
  await expect.poll(() => transcript.evaluate((list) => list.scrollTop))
    .toBeLessThan(geometry.bottomScrollTop);
});

test('a growing composer keeps the latest message visible and the transcript pinned', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    for (let index = 0; index < 18; index += 1) {
      window.addMessage(
        index % 2 ? 'assistant' : 'user',
        `Composer resize history ${index + 1}: enough content to keep the transcript scrollable.`,
      );
    }
  });
  await expect(page.locator('#msgList .msg')).toHaveCount(18);
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
    window.stateStore.dispatch({ type: "state/set", key: "_userScrolledAway", value: false });
  });

  await page.evaluate(() => {
    document.getElementById('chatInputWrap').style.minHeight = '240px';
  });
  await page.waitForTimeout(150);

  const geometry = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const lastBody = list.querySelector('.msg:last-child .msg-body');
    const bar = document.getElementById('chatInputBar');
    return {
      distanceFromBottom: Math.round(list.scrollHeight - list.scrollTop - list.clientHeight),
      clearance: Math.round(bar.getBoundingClientRect().top - lastBody.getBoundingClientRect().bottom),
      paddingBottom: Number.parseFloat(getComputedStyle(list).paddingBottom),
      barHeight: Math.round(bar.getBoundingClientRect().height),
      listBottom: Math.round(list.getBoundingClientRect().bottom),
      barTop: Math.round(bar.getBoundingClientRect().top),
    };
  });

  expect(geometry.paddingBottom).toBe(0);
  expect(geometry.listBottom).toBeLessThanOrEqual(geometry.barTop);
  expect(geometry.distanceFromBottom, JSON.stringify(geometry)).toBeLessThanOrEqual(2);
  expect(geometry.clearance, JSON.stringify(geometry)).toBeGreaterThanOrEqual(8);
});

test('late growth in the latest answer follows pinned readers but preserves manual scroll', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    for (let index = 0; index < 20; index += 1) {
      window.addMessage(
        index % 2 ? 'assistant' : 'user',
        `Late layout history ${index + 1}: async rich content may change this answer height.`,
      );
    }
  });
  await expect(page.locator('#msgList .msg')).toHaveCount(20);
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
    window.stateStore.dispatch({ type: "state/set", key: "_userScrolledAway", value: false });
    const body = list.querySelector('.msg:last-child .msg-body');
    const lateContent = document.createElement('div');
    lateContent.dataset.testLateContent = '1';
    lateContent.style.height = '240px';
    body.appendChild(lateContent);
  });
  await page.waitForTimeout(150);

  const pinnedDistance = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    return Math.round(list.scrollHeight - list.scrollTop - list.clientHeight);
  });
  expect(pinnedDistance).toBeLessThanOrEqual(2);

  const awayTop = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = Math.max(0, list.scrollTop - 240);
    window.stateStore.dispatch({ type: "state/set", key: "_userScrolledAway", value: true });
    const top = list.scrollTop;
    const lateContent = list.querySelector('[data-test-late-content="1"]');
    lateContent.style.height = '420px';
    return top;
  });
  await page.waitForTimeout(150);

  const preservedTop = await page.locator('#msgList').evaluate((list) => list.scrollTop);
  expect(Math.round(preservedTop)).toBe(Math.round(awayTop));

  const finalGeometry = await page.locator('#msgList').evaluate((list) => {
    list.scrollTop = list.scrollHeight;
    const lastBody = list.querySelector('.msg:last-child .msg-body');
    const bar = document.getElementById('chatInputBar');
    return {
      distanceFromBottom: Math.round(list.scrollHeight - list.scrollTop - list.clientHeight),
      clearance: Math.round(bar.getBoundingClientRect().top - lastBody.getBoundingClientRect().bottom),
    };
  });
  expect(finalGeometry.distanceFromBottom).toBeLessThanOrEqual(2);
  expect(finalGeometry.clearance).toBeGreaterThanOrEqual(8);
});
