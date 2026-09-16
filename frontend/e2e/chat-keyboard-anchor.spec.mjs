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

  /* The measured stream owns the timeline through a continuous chase:
     the painted inset must track each sample closely, never teleport to
     it, and never reverse while the keyboard is still rising. We record
     the painted inset on every animation frame while stepping the fake
     viewport through the stream, then assert on the whole trajectory. */
  const frames = await page.evaluate(async ({ bottom, insets }) => new Promise((resolve) => {
    const painted = [];
    let stepIndex = 0;
    const step = () => {
      if (stepIndex < insets.length) {
        window.__fakeViewport.__resize({ height: bottom - insets[stepIndex] });
        stepIndex += 1;
        setTimeout(step, 40);
      }
    };
    const sample = () => {
      painted.push(Number.parseFloat(
        document.documentElement.style.getPropertyValue('--keyboard-inset'),
      ) || 0);
      if (painted.length < 30) requestAnimationFrame(sample);
      else resolve(painted);
    };
    step();
    requestAnimationFrame(sample);
  }), { bottom: appBottom, insets: desiredInsets });

  /* Monotonic rise — the chase never reverses against an opening
     keyboard (1px tolerance for integer rounding). */
  for (let index = 1; index < frames.length; index += 1) {
    expect(frames[index]).toBeGreaterThanOrEqual(frames[index - 1] - 1);
  }
  /* No teleport: no single frame may cover a whole 60px stream step —
     the previous direct-write bug jumped the painted value straight to
     the measured target mid-flight. The spring's fastest frame during
     this stream is well under that. */
  const maxFrameDelta = Math.max(
    ...frames.slice(1).map((value, index) => value - frames[index]),
  );
  expect(maxFrameDelta, JSON.stringify(frames)).toBeLessThan(58);
  /* Attached: while the stream is live the painted inset stays within a
     bounded lag of the latest measured target, and once the stream ends
     it converges to the final inset exactly. */
  await page.waitForTimeout(400);
  const settled = await page.evaluate(() => parseFloat(
    document.documentElement.style.getPropertyValue('--keyboard-inset'),
  ));
  expect(settled).toBe(240);
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
  const firstLiftedFrame = opening.find((frame) => frame.inset > 2);
  expect(firstLiftedFrame?.open).toBe('true');
  for (let index = 1; index < opening.length; index += 1) {
    expect(opening[index].inset).toBeGreaterThanOrEqual(opening[index - 1].inset - 1);
    expect(opening[index].height).toBeGreaterThanOrEqual(opening[index - 1].height - 1);
    expect(opening[index].top).toBeLessThanOrEqual(opening[index - 1].top + 2);
  }
  expect(Math.max(...opening.slice(1).map((frame, index) =>
    frame.height - opening[index].height,
  ))).toBeLessThan(18);
  const openingInsets = opening.map((frame) => frame.inset);
  const lastMovingIndex = openingInsets.findLastIndex((value, index) => (
    index > 0 && Math.abs(value - openingInsets[index - 1]) > 0.01
  ));
  const finalOpeningStep = lastMovingIndex > 0
    ? openingInsets[lastMovingIndex] - openingInsets[lastMovingIndex - 1]
    : Infinity;
  expect(finalOpeningStep).toBeLessThan(4);

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

test('a discrete iOS viewport pan cannot teleport or reverse the composer', async ({ page }) => {
  await seedChat(page, 8);
  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await editor.focus();
  await page.waitForTimeout(80);

  const appBottom = await page.evaluate(() => Math.round(
    document.getElementById('appShell').getBoundingClientRect().bottom,
  ));
  const samples = await page.evaluate(async ({ bottom }) => new Promise((resolve) => {
    const positions = [];
    let frame = 0;
    const targets = [
      { height: bottom - 45, offsetTop: 0 },
      { height: bottom - 105, offsetTop: 64 },
      { height: bottom - 175, offsetTop: 112 },
      { height: bottom - 240, offsetTop: 76 },
    ];
    const sample = () => {
      if (frame < targets.length) window.__fakeViewport.__resize(targets[frame]);
      const root = document.documentElement;
      const view = document.getElementById('chatView');
      const barTop = document.getElementById('chatInputBar').getBoundingClientRect().top;
      positions.push({
        visualTop: barTop - window.visualViewport.offsetTop,
        barTop,
        offsetTop: window.visualViewport.offsetTop,
        inset: root.style.getPropertyValue('--keyboard-inset'),
        compensation: root.style.getPropertyValue('--keyboard-pan-compensation'),
        transform: getComputedStyle(view).transform,
      });
      frame += 1;
      if (frame < 28) requestAnimationFrame(sample);
      else resolve(positions);
    };
    requestAnimationFrame(sample);
  }), { bottom: appBottom });

  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index].visualTop, JSON.stringify(samples)).toBeLessThanOrEqual(samples[index - 1].visualTop + 2);
  }
  const largestStep = Math.max(...samples.slice(1).map((value, index) => (
    Math.abs(value.visualTop - samples[index].visualTop)
  )));
  /* A 240px IME lift delivered in four compositor samples can legitimately
     cover ~45px in one 60Hz frame. Guard against the old 64-112px pan jump,
     while allowing the controller to remain attached to a fast keyboard. */
  expect(largestStep, JSON.stringify(samples)).toBeLessThan(50);
  await expect.poll(async () => page.evaluate(() => Number.parseFloat(
    document.documentElement.style.getPropertyValue('--keyboard-inset'),
  ))).toBe(164);
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

  /* The transcript must stay glued to the composer on every painted frame
     of the lift — the correction is written in the same frame as the
     inset write, so a pinned reader's distance-from-bottom never opens
     up mid-motion. */
  const liftDistances = await page.evaluate(() => new Promise((resolve) => {
    const list = document.getElementById('msgList');
    const distances = [];
    const sample = () => {
      distances.push(Math.round(list.scrollHeight - list.scrollTop - list.clientHeight));
      if (distances.length < 24) requestAnimationFrame(sample); else resolve(distances);
    };
    window.__fakeViewport.__resize({ height: 510 });
    requestAnimationFrame(sample);
  }));
  expect(Math.max(...liftDistances), JSON.stringify(liftDistances)).toBeLessThanOrEqual(4);
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

test('a prompt sent with the keyboard open keeps its top offset when the keyboard closes', async ({ page }) => {
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: [DONE]\n\n',
    });
  });
  await seedChat(page, 30);

  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await editor.focus();
  await page.waitForTimeout(120);
  /* Keyboard up: the transcript viewport shrinks under the prompt the send
     is about to anchor, so the send-time reserve is measured short. */
  await page.evaluate(() => window.__fakeViewport.__resize({ height: 510 }));
  await expect.poll(async () => (await transcriptState(page)).inset).toBe('334px');
  await page.waitForTimeout(320);

  await page.evaluate(() => window.submitChatMessage('Keep this prompt at the top'));

  const promptOffset = () => page.evaluate(() => {
    const list = document.getElementById('msgList');
    const users = list.querySelectorAll('.msg-user, .msg.user');
    const latest = users[users.length - 1];
    if (!latest) return 9999;
    return Math.round(latest.getBoundingClientRect().top - list.getBoundingClientRect().top);
  });
  await expect.poll(promptOffset, { timeout: 5_000 }).toBeLessThanOrEqual(24);

  /* Sample the prompt for the whole close motion. Without a reserve that
     tracks the growing transcript, the browser clamps scrollTop and the
     prompt lands hundreds of pixels lower in one frame. */
  const sampling = page.evaluate(() => new Promise((resolve) => {
    const list = document.getElementById('msgList');
    const offsets = [];
    const deadline = performance.now() + 700;
    const tick = () => {
      const users = list.querySelectorAll('.msg-user, .msg.user');
      const latest = users[users.length - 1];
      offsets.push(latest
        ? Math.round(latest.getBoundingClientRect().top - list.getBoundingClientRect().top)
        : null);
      if (performance.now() > deadline) { resolve(offsets); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }));
  await page.evaluate(() => window.__fakeViewport.__resize({ height: 844 }));
  const samples = (await sampling).filter((value) => value != null);

  expect(samples.length).toBeGreaterThan(0);
  expect(Math.max(...samples), JSON.stringify(samples)).toBeLessThanOrEqual(24);
  for (let i = 1; i < samples.length; i += 1) {
    expect(
      Math.abs(samples[i] - samples[i - 1]),
      `prompt jumped at sample ${i}: ${JSON.stringify(samples)}`,
    ).toBeLessThanOrEqual(8);
  }
  /* The keyboard really closed, and the transcript still has content below
     the anchored prompt rather than being scrolled to the bottom. */
  await expect.poll(async () => (await transcriptState(page)).inset).toBe('0px');
  expect((await transcriptState(page)).distanceFromBottom).toBeGreaterThan(0);
});

test('a wheel gesture during the keyboard lift owns the scroll', async ({ page }) => {  await seedChat(page);
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
  /* The pan compensation is written inside the viewport event itself, so
     the tracked row's visual offset holds on every painted frame — a
     deferred restore would let it drift by the full pan delta for a
     frame. */
  const panDrift = await page.evaluate((needle) => new Promise((resolve) => {
    const list = document.getElementById('msgList');
    const row = [...list.querySelectorAll(':scope > .msg')]
      .find((el) => el.textContent.startsWith(needle));
    const offsets = [];
    const sample = () => {
      offsets.push(row
        ? Math.round(
            row.getBoundingClientRect().top
            - list.getBoundingClientRect().top
            - (window.visualViewport?.offsetTop || 0),
          )
        : null);
      if (offsets.length < 12) requestAnimationFrame(sample); else resolve(offsets);
    };
    window.__fakeViewport.__resize({ height: 410, offsetTop: 100 });
    requestAnimationFrame(sample);
  }), anchoredRow);
  const panOffsets = panDrift.filter((value) => value != null);
  for (const offset of panOffsets) {
    expect(Math.abs(offset - settledVisual), JSON.stringify(panDrift)).toBeLessThanOrEqual(3);
  }
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
