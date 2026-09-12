// e2e/chat-keyboard-anchor.spec.mjs
//
// Keyboard-transition transcript anchoring contract:
//
//   1. A history reader is never dragged to the bottom when the virtual
//      keyboard changes the transcript's flex height — neither through
//      the external --keyboard-inset fallback nor through the measured
//      visualViewport path.
//   2. A reader following the bottom keeps following through the lift.
//   3. A wheel/touch gesture during the transition owns the scroll: the
//      anchor is abandoned instead of fighting the user.
//
// The measured path is driven through a fake window.visualViewport so the
// real keyboardViewport.js rAF interpolation runs in Chromium.

import { test } from './_lib.mjs';
import { expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* Install a controllable visual viewport before the bundle loads. The app
   shims must not use the real browser property, so every module that
   reads it (keyboardViewport, composer popovers) sees this object. */
function installFakeVisualViewport(page) {
  return page.addInitScript(() => {
    const listeners = { resize: new Set(), scroll: new Set() };
    const fake = {
      width: 390,
      height: 844,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
      addEventListener(type, fn) {
        (listeners[type] || (listeners[type] = new Set())).add(fn);
      },
      removeEventListener(type, fn) {
        if (listeners[type]) listeners[type].delete(fn);
      },
      dispatchEvent(event) {
        const type = event && event.type;
        if (listeners[type]) listeners[type].forEach((fn) => fn(event));
        return true;
      },
      __resize({ height, offsetTop = 0 }) {
        fake.height = height;
        fake.offsetTop = offsetTop;
        fake.dispatchEvent(new Event('resize'));
      },
    };
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      get: () => fake,
    });
    window.__fakeViewport = fake;
  });
}

async function seedChat(page, count = 40) {
  await page.evaluate((n) => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '99999999-9999-4999-8999-999999999999' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    document.documentElement.style.setProperty('--keyboard-inset', '0px');
    document.documentElement.dataset.keyboardOpen = 'false';
    for (let i = 0; i < n; i += 1) {
      window.addMessage(i % 2 ? 'assistant' : 'user', `History ${i + 1}: ${'content '.repeat(8)}`);
    }
  }, count);
  await expect(page.locator('#msgList .msg')).toHaveCount(count);
  await page.waitForTimeout(250);
}

/* Visual offset of one specific row: its position inside the list minus the
   visual-viewport pan. Keeping this constant is what "the reader's content
   stays under the same visual position" means. */
async function rowVisualOffset(page, needle) {
  return page.evaluate((text) => {
    const list = document.getElementById('msgList');
    const row = [...list.querySelectorAll(':scope > .msg')]
      .find((el) => el.textContent.startsWith(text));
    if (!row) return null;
    return Math.round(
      row.getBoundingClientRect().top
      - list.getBoundingClientRect().top
      - (window.visualViewport?.offsetTop || 0),
    );
  }, needle);
}

async function transcriptState(page) {
  return page.evaluate(() => {
    const list = document.getElementById('msgList');
    const rows = list.querySelectorAll(':scope > .msg');
    const listRect = list.getBoundingClientRect();
    let anchorOffset = null;
    let anchorText = null;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom > listRect.top + 1) {
        anchorOffset = Math.round(rect.top - listRect.top);
        anchorText = row.textContent.slice(0, 16);
        break;
      }
    }
    return {
      scrollTop: Math.round(list.scrollTop),
      clientHeight: Math.round(list.clientHeight),
      distanceFromBottom: Math.round(list.scrollHeight - list.scrollTop - list.clientHeight),
      anchorOffset,
      anchorText,
      inset: getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset').trim(),
      viewportOffsetTop: Math.round(window.visualViewport?.offsetTop || 0),
      away: Boolean(window.stateStore.read('_userScrolledAway')),
    };
  });
}

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await installFakeVisualViewport(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
});

test('progressive viewport samples keep the composer attached to the rising keyboard', async ({ page }) => {
  await seedChat(page, 8);
  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await editor.focus();
  await page.waitForTimeout(80);

  const appBottom = await page.evaluate(() => Math.round(
    document.getElementById('appShell').getBoundingClientRect().bottom,
  ));
  const desiredInsets = [60, 120, 180, 240];
  const samples = [];
  for (const desiredInset of desiredInsets) {
    const height = appBottom - desiredInset;
    await page.evaluate((nextHeight) => window.__fakeViewport.__resize({ height: nextHeight }), height);
    /* Allow the resize coalescer and inset writer one frame each. Samples
       remain closer than KEYBOARD_PROGRESSIVE_SAMPLE_MS, like a real IME. */
    await page.waitForTimeout(40);
    samples.push(await page.evaluate(() => parseFloat(
      document.documentElement.style.getPropertyValue('--keyboard-inset'),
    )));
  }

  expect(samples, JSON.stringify(samples)).toEqual([...samples].sort((a, b) => a - b));
  /* From the second native sample onward, the measured inset itself owns
     the timeline; the composer must not trail a freshly restarted tween. */
  expect(Math.abs(samples[1] - desiredInsets[1]), JSON.stringify(samples)).toBeLessThanOrEqual(2);
  expect(Math.abs(samples[2] - desiredInsets[2]), JSON.stringify(samples)).toBeLessThanOrEqual(2);
  expect(Math.abs(samples[3] - desiredInsets[3]), JSON.stringify(samples)).toBeLessThanOrEqual(2);
});

test('keyboard lift keeps composer geometry on the same continuous timeline', async ({ page }) => {
  await seedChat(page, 8);
  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await editor.focus();
  await page.waitForTimeout(80);

  const appBottom = await page.evaluate(() => Math.round(
    document.getElementById('appShell').getBoundingClientRect().bottom,
  ));
  const sampleMotion = (height) => page.evaluate((nextHeight) => new Promise((resolve) => {
    const samples = [];
    let count = 0;
    window.__fakeViewport.__resize({ height: nextHeight });
    const sample = () => {
      const root = document.documentElement;
      const wrap = document.getElementById('chatInputWrap');
      const bar = document.getElementById('chatInputBar');
      const rect = bar.getBoundingClientRect();
      samples.push({
        inset: Number.parseFloat(getComputedStyle(root).getPropertyValue('--keyboard-inset')) || 0,
        height: wrap.getBoundingClientRect().height,
        top: rect.top,
        open: root.dataset.keyboardOpen,
      });
      if (++count < 24) requestAnimationFrame(sample);
      else resolve(samples);
    };
    requestAnimationFrame(sample);
  }), height);

  const opening = await sampleMotion(appBottom - 240);
  expect(opening.at(-1).open).toBe('true');
  for (let index = 1; index < opening.length; index += 1) {
    expect(opening[index].inset).toBeGreaterThanOrEqual(opening[index - 1].inset - 1);
    expect(opening[index].height).toBeGreaterThanOrEqual(opening[index - 1].height - 1);
    expect(opening[index].top).toBeLessThanOrEqual(opening[index - 1].top + 2);
  }
  expect(Math.max(...opening.slice(1).map((frame, index) =>
    frame.height - opening[index].height,
  ))).toBeLessThan(18);

  const closing = await sampleMotion(appBottom);
  expect(closing.at(-1).open).toBe('false');
  for (let index = 1; index < closing.length; index += 1) {
    expect(closing[index].inset).toBeLessThanOrEqual(closing[index - 1].inset + 1);
    expect(closing[index].height).toBeLessThanOrEqual(closing[index - 1].height + 1);
    expect(closing[index].top).toBeGreaterThanOrEqual(closing[index - 1].top - 2);
  }
  expect(Math.max(...closing.slice(1).map((frame, index) =>
    closing[index].height - frame.height,
  ))).toBeLessThan(18);
});

test('external keyboard inset keeps a history reader anchored instead of snapping to the bottom', async ({ page }) => {
  await seedChat(page);
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = 600;
  });
  await page.waitForTimeout(200);
  const before = await transcriptState(page);

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--keyboard-inset', '300px');
  });
  await page.waitForTimeout(450);
  const after = await transcriptState(page);

  expect(after.scrollTop).toBe(before.scrollTop);
  expect(after.anchorText).toBe(before.anchorText);
  expect(Math.abs(after.anchorOffset - before.anchorOffset)).toBeLessThanOrEqual(1);
  expect(after.distanceFromBottom).toBeGreaterThan(64);
});

test('visualViewport keyboard lift follows a pinned reader through open and close', async ({ page }) => {
  await seedChat(page);
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
    window.stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: false });
  });
  await page.waitForTimeout(200);

  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await editor.focus();
  await page.waitForTimeout(100);

  await page.evaluate(() => window.__fakeViewport.__resize({ height: 510 }));
  await expect.poll(async () => (await transcriptState(page)).inset).toBe('334px');
  await page.waitForTimeout(400);
  const lifted = await transcriptState(page);
  expect(lifted.distanceFromBottom).toBeLessThanOrEqual(4);

  /* Grow the latest answer while the keyboard is open (streaming tail /
     late rich content): a following reader must keep the newest content
     visible above the composer. */
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const body = list.querySelector('.msg:last-child .msg-body');
    const late = document.createElement('div');
    late.style.height = '240px';
    body.appendChild(late);
  });
  await page.waitForTimeout(300);
  expect((await transcriptState(page)).distanceFromBottom).toBeLessThanOrEqual(4);

  await page.evaluate(() => window.__fakeViewport.__resize({ height: 844 }));
  await expect.poll(async () => (await transcriptState(page)).inset).toBe('0px');
  await page.waitForTimeout(400);
  const closed = await transcriptState(page);
  expect(closed.distanceFromBottom).toBeLessThanOrEqual(4);
});

test('visualViewport keyboard lift keeps a history reader anchored and never forces the bottom', async ({ page }) => {
  await seedChat(page);
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    /* A real upward gesture marks the reader as inspecting history. */
    list.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true }));
    list.scrollTop = 600;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect.poll(async () => (await transcriptState(page)).away).toBe(true);
  const before = await transcriptState(page);

  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await editor.focus();
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__fakeViewport.__resize({ height: 510 }));
  await expect.poll(async () => (await transcriptState(page)).inset).toBe('334px');
  await page.waitForTimeout(400);

  const lifted = await transcriptState(page);
  expect(lifted.scrollTop).toBe(before.scrollTop);
  expect(lifted.anchorText).toBe(before.anchorText);
  expect(Math.abs(lifted.anchorOffset - before.anchorOffset)).toBeLessThanOrEqual(1);
  expect(lifted.distanceFromBottom).toBeGreaterThan(64);

  await page.evaluate(() => window.__fakeViewport.__resize({ height: 844 }));
  await expect.poll(async () => (await transcriptState(page)).inset).toBe('0px');
  await page.waitForTimeout(400);
  const closed = await transcriptState(page);
  expect(closed.anchorText).toBe(before.anchorText);
  expect(Math.abs(closed.anchorOffset - before.anchorOffset)).toBeLessThanOrEqual(1);
});

test('a wheel gesture during the keyboard lift owns the scroll', async ({ page }) => {
  await seedChat(page);
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
    window.stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: false });
  });
  await page.waitForTimeout(200);

  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await editor.focus();
  await page.evaluate(() => window.__fakeViewport.__resize({ height: 510 }));

  /* Mid-lift: the reader grabs the transcript and scrolls up. */
  await page.waitForTimeout(40);
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true }));
    list.scrollTop = 400;
  });
  await page.waitForTimeout(500);

  const state = await transcriptState(page);
  expect(state.away).toBe(true);
  expect(Math.abs(state.scrollTop - 400)).toBeLessThanOrEqual(1);
  expect(state.distanceFromBottom).toBeGreaterThan(64);
});

test('visual viewport pan compensates a history reader and returns on un-pan', async ({ page }) => {
  await seedChat(page);
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true }));
    list.scrollTop = 600;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect.poll(async () => (await transcriptState(page)).away).toBe(true);

  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await editor.focus();
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__fakeViewport.__resize({ height: 510 }));
  await expect.poll(async () => (await transcriptState(page)).inset).toBe('334px');
  await page.waitForTimeout(500);
  const settled = await transcriptState(page);
  const anchoredRow = settled.anchorText;
  const settledVisual = await rowVisualOffset(page, anchoredRow);

  /* iOS pans the visual viewport down while the keyboard is up. The
     composer lift target is unchanged (offsetTop is included in the
     measurement), but the transcript must compensate the pan so the
     reader's content stays under the same visual position: scrollTop moves
     opposite to offsetTop, not with it. The topmost visible row may change
     because the cut line moves inside the previous row, so the assertion is
     on the tracked row's visual offset, not on the first intersecting row. */
  await page.evaluate(() => window.__fakeViewport.__resize({ height: 410, offsetTop: 100 }));
  await page.waitForTimeout(420);
  const panned = await transcriptState(page);
  expect(panned.away).toBe(true);
  expect(panned.scrollTop).toBe(settled.scrollTop - 100);
  expect(await rowVisualOffset(page, anchoredRow)).toBe(settledVisual);

  await page.evaluate(() => window.__fakeViewport.__resize({ height: 510, offsetTop: 0 }));
  await page.waitForTimeout(420);
  const unpanned = await transcriptState(page);
  expect(unpanned.scrollTop).toBe(settled.scrollTop);
  expect(await rowVisualOffset(page, anchoredRow)).toBe(settledVisual);
  expect(unpanned.distanceFromBottom).toBeGreaterThan(64);
});

test('layout-viewport compression (Android resizes-content) follows pinned and anchors history', async ({ page }) => {
  await seedChat(page);

  /* Pinned: the layout shrinks like an Android resize-content keyboard. */
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
    window.stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: false });
  });
  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await editor.focus();
  await page.waitForTimeout(150);
  await page.setViewportSize({ width: 390, height: 544 });
  await page.waitForTimeout(450);
  expect((await transcriptState(page)).distanceFromBottom).toBeLessThanOrEqual(4);
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const body = list.querySelector('.msg:last-child .msg-body');
    const late = document.createElement('div');
    late.style.height = '200px';
    body.appendChild(late);
  });
  await page.waitForTimeout(300);
  expect((await transcriptState(page)).distanceFromBottom).toBeLessThanOrEqual(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(450);
  expect((await transcriptState(page)).distanceFromBottom).toBeLessThanOrEqual(4);

  /* History: the same compression must not move the reader. */
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true }));
    list.scrollTop = 600;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect.poll(async () => (await transcriptState(page)).away).toBe(true);
  const before = await transcriptState(page);
  await page.setViewportSize({ width: 390, height: 544 });
  await page.waitForTimeout(450);
  const shrunk = await transcriptState(page);
  expect(shrunk.scrollTop).toBe(before.scrollTop);
  expect(shrunk.anchorText).toBe(before.anchorText);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(450);
  const restored = await transcriptState(page);
  expect(restored.scrollTop).toBe(before.scrollTop);
  expect(restored.anchorText).toBe(before.anchorText);
});
