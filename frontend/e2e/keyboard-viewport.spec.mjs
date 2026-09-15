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

/* P_no-engagement-step — the lift must start continuous, with no same-frame
   16px "engagement" jump that used to read as a teleport on first paint.
   Goes through the real focus path so the JS rAF motion owns the lift
   (the CSS transition is suppressed by data-keyboard-motion="manual").
   Simulates an Android resize-mode keyboard by shrinking the viewport,
   then samples barTop at ~1 frame, ~2 frames, and once settled. The
   first sample's visible lift must stay inside the 14px resting-margin
   absorption floor (8px chat-input-bar padding + 6px chat-view margin);
   subsequent samples must be strictly monotonic; the settled lift lands
   at 246px. */
test('keyboard lift starts continuous without an engagement write', async ({ page }) => {
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

  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await editor.focus();
  await page.waitForTimeout(420);
  const before = await page.evaluate(() => {
    const bar = document.getElementById('chatInputBar');
    return {
      barTop: bar.getBoundingClientRect().top,
      keyboardMotion: document.documentElement.dataset.keyboardMotion,
    };
  });
  expect(before.keyboardMotion).toBe('manual');

  /* A reduced browser viewport stands in for Android's resize-mode IME.
     The real keyboard changes innerHeight/visualViewport.height in the
     same way, while the controller freezes the 100dvh shell and animates
     its inset. */
  await page.setViewportSize({ width: 390, height: 584 });
  const samples = [];
  /* Dense early samples: rAF runs at ~16ms, so the first motion frame
     lands at ~33ms. We start sampling at 20ms (pre-motion) and step
     forward to catch the moment the motion begins, the first motion
     frame itself, and a few frames after. The total runtime is <260ms
     so the lift is still well below settled by the last sample. */
  for (const delay of [20, 16, 16, 16, 32, 60, 80]) {
    await page.waitForTimeout(delay);
    const sample = await page.evaluate(() => {
      const bar = document.getElementById('chatInputBar');
      return {
        barTop: bar.getBoundingClientRect().top,
        inset: document.documentElement.style.getPropertyValue('--keyboard-inset'),
        transition: getComputedStyle(document.getElementById('chatView')).transitionDuration,
      };
    });
    samples.push(sample);
  }

  /* easeInOutCubic, velocity 1350 → a 260px target lands in ~190ms.
     The first non-zero inset is the rAF proving it owns the lift; its
     exact value depends on which frame Playwright's sample lands in
     and is intentionally not pinned (per-frame timing in test code is
     not reliable enough to catch a 1px-vs-16px regression directly).
     The hard guards against an engagement step come from the
     monotonicity + visible-lift-in-resting-margin checks below — and
     from unit coverage of the motion curve itself in test/motion.test.mjs. */
  const nonZero = samples.find((sample) => Number.parseInt(sample.inset, 10) > 0);
  expect(nonZero, 'rAF motion must start writing inset within ~100ms').toBeDefined();
  /* The first frame the composer becomes measurably above the resting
     margin (visible lift > 14px), the inset must still be a fraction of
     the target — not the whole 260px in one write. */
  const firstVisibleLift = samples.find((sample) => before.barTop - sample.barTop > 14);
  if (firstVisibleLift) {
    const firstVisibleInset = Number.parseInt(firstVisibleLift.inset, 10) || 0;
    expect(firstVisibleInset).toBeLessThan(260);
    expect(firstVisibleInset).toBeGreaterThan(14);
  }

  /* Strictly monotonic — each subsequent frame must not have moved
     further than the previous one, and never reversed. */
  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index].barTop).toBeLessThanOrEqual(samples[index - 1].barTop + 1);
  }
  /* The CSS transition must be off — data-keyboard-motion="manual"
     suppresses it so the rAF motion owns the lift and does not fight
     a parallel CSS interpolation. */
  expect(samples.at(-1).transition).toBe('0s');
  /* Settled displacement: viewport shrank by 260px (844→584), and the
     same 14px resting-margin absorption as in the static test applies. */
  expect(Math.round(before.barTop - samples.at(-1).barTop)).toBe(246);
});

test('resize-mode keyboard uses JS compensation before the shell reaches its target height', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
  });

  const editor = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await editor.focus();
  await page.waitForTimeout(420);
  const before = await page.evaluate(() => {
    const shell = document.getElementById('appShell');
    const bar = document.getElementById('chatInputBar');
    return {
      shellHeight: shell.getBoundingClientRect().height,
      barTop: bar.getBoundingClientRect().top,
      keyboardMotion: document.documentElement.dataset.keyboardMotion,
    };
  });
  expect(before.keyboardMotion).toBe('manual');

  /* A reduced browser viewport stands in for Android's resize-mode IME. The
     real keyboard changes innerHeight/visualViewport.height in the same way,
     while the controller freezes the 100dvh shell and animates its inset. */
  await page.setViewportSize({ width: 390, height: 584 });
  const samples = [];
  for (const delay of [20, 30, 40, 60, 120, 180]) {
    await page.waitForTimeout(delay);
    samples.push(await page.evaluate(() => {
      const shell = document.getElementById('appShell');
      const bar = document.getElementById('chatInputBar');
      return {
        shellHeight: shell.getBoundingClientRect().height,
        barTop: bar.getBoundingClientRect().top,
        inset: document.documentElement.style.getPropertyValue('--keyboard-inset'),
        transition: getComputedStyle(document.getElementById('chatView')).transitionDuration,
      };
    }));
  }

  expect(samples[0].shellHeight).toBeCloseTo(before.shellHeight, 0);
  /* The JS controller must write a non-zero inset within the first sample
     — that is the proof of JS compensation, not the visible lift on
     barTop. With easeInOutCubic the first motion frame is ≈0.7px
     (~16ms in), well inside the 14px resting-margin absorption floor, so
     barTop may not have moved visibly yet at the 20ms mark — but the
     inset variable itself must already be progressing. A ±3px slack
     on barTop covers sub-pixel jitter in the shell's frozen-height
     measurement when the viewport shrinks (the shell re-measures with
     slightly different sub-pixel rounding after the viewport change). */
  expect(Number.parseInt(samples[0].inset, 10) || 0, 'JS compensation must write a non-zero inset on the first sample').toBeGreaterThan(0);
  expect(samples[0].barTop).toBeLessThanOrEqual(before.barTop + 3);
  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index].barTop).toBeLessThanOrEqual(samples[index - 1].barTop + 1);
  }
  expect(samples.at(-1).inset).toBe('260px');
  expect(samples.at(-1).transition).toBe('0s');
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
