// e2e/chat-autoscroll.spec.mjs — chat-experience-revamp, Task 10.2
//
// Playwright spec for smooth auto-scroll and scroll-off (Requirements
// 2.3, 2.4, 5.3). It exercises the pinned-reader / scroll-away contract
// wired through ui/scroll.js + ui/scrollPill.js (shouldAutoScroll,
// showNewReplyPill/hideNewReplyPill, state._userScrolledAway):
//
//   1. While content streams and the reader is pinned to the bottom,
//      the view keeps the newest content in view (distance-from-bottom
//      stays small).
//   2. After an upward gesture, auto-scroll stops (the reader is no
//      longer tracked to the bottom) and the "↓ new response" pill
//      (#newReplyPill) becomes visible.
//   3. Clicking the pill clears state._userScrolledAway and snaps back
//      to the bottom (re-pins).
//
// Boot pattern and stream mocking mirror streaming-render.spec.mjs /
// thinking-panel.spec.mjs. Timing assertions use expect.poll with
// generous slack to stay stable on CI.

import { test } from './_lib.mjs';
import { expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* Install a controllable SSE stream so the test drives when each delta
   lands. window.__pushDelta(text) enqueues one assistant content delta;
   window.__finishStream() emits [DONE] and closes. Only /chat/stream is
   intercepted; every other request falls through to mockAuthedApp. */
function installControllableStream(page) {
  return page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!/\/api\/(?:v2\/)?chat\/stream/.test(url)) return nativeFetch(input, init);
      const encoder = new TextEncoder();
      let controllerRef;
      const body = new ReadableStream({
        start(controller) { controllerRef = controller; },
      });
      window.__pushDelta = (text) => {
        const payload = { choices: [{ delta: { content: text } }] };
        controllerRef.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      window.__finishStream = () => {
        controllerRef.enqueue(encoder.encode('data: [DONE]\n\n'));
        controllerRef.close();
      };
      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  });
}

/* Boot into the chat shell with a tall transcript so the scroller
   overflows, pin the reader to the bottom, and start a streaming turn.
   Mirrors prepareDelayedStream() in streaming-render.spec.mjs. */
async function bootStreamingChat(page) {
  await page.evaluate(async () => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: '88888888-8888-4888-8888-888888888888' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');

    /* A tall transcript so the scroller overflows. These go through
       state.messages rather than appendChild: #msgList is React-owned, so a
       foreign node is not something the renderer promises to keep. */
    const earlier = [];
    for (let i = 0; i < 24; i += 1) {
      const text = `Earlier message ${i}: ${'context '.repeat(12)}`;
      earlier.push({ clientId: 'pre-' + i, role: 'assistant', rawText: text, html: `<p>${text}</p>`, type: null });
    }
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'user-scroll', role: 'user', rawText: 'Scroll smoothly', html: null }, ...earlier] });
    /* The renderer re-reads state.messages when the turn publishes its first
       event, so start the stream, then wait for the list to actually overflow
       before pinning — "at the bottom" is meaningless while nothing scrolls. */
    window.__streamPromise = window.askChatTurn('Scroll smoothly');
    const list = document.getElementById('msgList');
    await new Promise((resolve) => {
      const wait = () => {
        if (list.querySelector('.msg.assistant[data-viewport-anchor]')
          && list.scrollHeight > list.clientHeight + 80) return resolve();
        requestAnimationFrame(wait);
      };
      wait();
    });
    /* A send owns the scroll for a bounded moment: scheduleActiveTurnToTop
       holds the submitted prompt at the top of the viewport while the composer
       settles, so pinning during that window measures a position the app is
       deliberately not at yet. Wait it out, then pin like a reader who scrolled
       down to follow the answer. */
    await new Promise((resolve) => setTimeout(resolve, 600));
    list.scrollTop = list.scrollHeight;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    window.stateStore.dispatch({ type: "state/set", key: "_userScrolledAway", value: false });
  });
}

/* distance-from-bottom of the chat scroller, rounded to px. Small
   values mean the reader is pinned to the newest content. */
function distanceFromBottom(page) {
  return page.evaluate(() => {
    const list = document.getElementById('msgList');
    return Math.round(list.scrollHeight - list.scrollTop - list.clientHeight);
  });
}

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await installControllableStream(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
});

test('pinned reader stays at the bottom while content streams', async ({ page }) => {
  await bootStreamingChat(page);

  // Push the first delta so the live tail (.tool-run-prose.is-live — the
  // re-parsed block of the declarative turn) mounts, then bind the bubble.
  await page.evaluate(() => window.__pushDelta('The answer begins and keeps growing. '));
  const bubble = page.locator('.msg.assistant').filter({ has: page.locator('.tool-run-prose.is-live') });
  await expect(bubble).toHaveCount(1);

  // A pinned reader should keep the newest content in view —
  // distance-from-bottom stays within the pin slack. (The live tail
  // renders with a typewriter cadence, so assert on its leading text
  // rather than a specific trailing word.)
  await expect(bubble.locator('.tool-run-prose.is-live')).toContainText('The answer begins');
  await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(4);

  // Push a large delta that forces the scroller to grow well past one
  // viewport; the pinned reader is followed to the new bottom.
  await page.evaluate(() => window.__pushDelta('It adds several more lines of streamed content to force the scroller to grow well past a single viewport height while the reader remains pinned. '.repeat(6)));
  await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(4);

  // The scroll-away flag must remain clear for a pinned reader.
  expect(await page.evaluate(() => window.stateStore.read("_userScrolledAway"))).toBe(false);
  await expect(page.locator('#newReplyPill')).not.toHaveClass(/visible/);

  await page.evaluate(() => window.__finishStream());
  await page.evaluate(() => window.__streamPromise);
});

test('upward gesture stops auto-scroll and shows the new-reply pill; clicking it re-pins', async ({ page }) => {
  await bootStreamingChat(page);

  // Prime the stream so the streaming surface mounts, then confirm the
  // reader starts pinned.
  await page.evaluate(() => window.__pushDelta('The answer begins and keeps growing with enough content to overflow the scroller. '.repeat(3)));
  const bubble = page.locator('.msg.assistant').filter({ has: page.locator('.tool-run-prose.is-live') });
  await expect(bubble).toHaveCount(1);
  await expect(bubble.locator('.tool-run-prose.is-live')).toContainText('The answer begins');
  await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(4);

  // Upward gesture: an upward wheel flick is the user intent that
  // scrollPill.js turns into state._userScrolledAway (releasePin()).
  // Dispatch it on the scroller and move the viewport up so the reader
  // is genuinely off the bottom.
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true }));
    list.scrollTop = 0;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
  });

  // Auto-scroll must stop: the flag flips and the reader stays off the
  // bottom even as more content streams in.
  await expect.poll(() => page.evaluate(() => window.stateStore.read("_userScrolledAway"))).toBe(true);
  const distanceAfterGesture = await distanceFromBottom(page);
  expect(distanceAfterGesture).toBeGreaterThan(64);

  await page.evaluate(() => window.__pushDelta('More streamed content arrives while the reader has scrolled away and should not be dragged back down. '.repeat(3)));
  // The reader was NOT re-pinned by the new delta (auto-scroll stopped).
  await expect.poll(() => distanceFromBottom(page)).toBeGreaterThan(64);

  // The "↓ new response" pill becomes visible while scrolled away.
  await expect(page.locator('#newReplyPill')).toHaveClass(/visible/);

  // Clicking the pill clears the scrolled-away flag and snaps to bottom.
  await page.locator('#newReplyPill').click();
  await expect.poll(() => page.evaluate(() => window.stateStore.read("_userScrolledAway"))).toBe(false);
  await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(4);
  await expect(page.locator('#newReplyPill')).not.toHaveClass(/visible/);

  await page.evaluate(() => window.__finishStream());
  await page.evaluate(() => window.__streamPromise);
});

/* Boot a transcript tall enough to scroll, pinned to the bottom, then send
   through the real composer pipeline so the send-time turn anchor runs. */
async function bootSendableChat(page) {
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: '99999999-9999-4999-8999-999999999999' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    for (let i = 0; i < 30; i += 1) {
      window.addMessage(i % 2 ? 'assistant' : 'user', `Anchor history ${i + 1}: ${'context '.repeat(12)}`);
    }
  });
  await expect(page.locator('#msgList .msg')).toHaveCount(30);
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
    window.stateStore.dispatch({ type: "state/set", key: "_userScrolledAway", value: false });
  });
  await page.waitForTimeout(250);
}

test('send glides the prompt to the top instead of teleporting', async ({ page }) => {
  await bootSendableChat(page);
  const startTop = await page.evaluate(() => Math.round(document.getElementById('msgList').scrollTop));

  /* Sample the scroller for the whole anchor window: the settling flag is
     set when the glide starts and cleared when it converges. */
  const motionPromise = page.evaluate(() => new Promise((resolve) => {
    const list = document.getElementById('msgList');
    const values = [];
    let sawSettling = false;
    const deadline = performance.now() + 1800;
    const tick = () => {
      values.push(Math.round(list.scrollTop));
      if (list.dataset.turnAnchorSettling === 'true') sawSettling = true;
      if ((sawSettling && list.dataset.turnAnchorSettling !== 'true') || performance.now() > deadline) {
        resolve(values);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }));

  await page.evaluate(() => window.submitChatMessage('Glide the prompt to the top'));
  const values = await motionPromise;

  /* More than one frame of distinct positions proves the transition was
     animated; the final position is past the starting bottom. */
  const finalTop = values[values.length - 1];
  const distinct = new Set(values).size;
  expect(distinct, JSON.stringify(values)).toBeGreaterThan(2);
  expect(values.some((value) => value > startTop && value < finalTop)).toBe(true);

  const settled = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const users = list.querySelectorAll('.msg-user, .msg.user');
    const latest = users[users.length - 1];
    const listRect = list.getBoundingClientRect();
    return {
      userOffset: Math.round(latest.getBoundingClientRect().top - listRect.top),
      settling: list.dataset.turnAnchorSettling === 'true',
      away: window.stateStore.read('_userScrolledAway'),
    };
  });
  expect(settled.settling).toBe(false);
  expect(settled.away).toBe(false);
  expect(settled.userOffset).toBeGreaterThanOrEqual(-2);
  expect(settled.userOffset).toBeLessThanOrEqual(24);

  await page.evaluate(() => window.__finishStream());
  await page.waitForTimeout(200);
});

test('sticky bottom resumes once the answer outgrows the prompt reserve', async ({ page }) => {
  await bootSendableChat(page);
  await page.evaluate(() => window.submitChatMessage('A long streamed answer follows this prompt'));

  /* The prompt is anchored near the top with reserved answer room below. */
  await expect.poll(() => page.evaluate(() => Boolean(
    document.querySelector('#msgList .msg.assistant.turn-viewport-anchor'),
  ))).toBe(true);
  await expect.poll(() => page.evaluate(() => document.getElementById('msgList').dataset.turnAnchorSettling === 'true')).toBe(false);
  const anchored = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const users = list.querySelectorAll('.msg-user, .msg.user');
    const latest = users[users.length - 1];
    return {
      userOffset: Math.round(latest.getBoundingClientRect().top - list.getBoundingClientRect().top),
      distance: Math.round(list.scrollHeight - list.scrollTop - list.clientHeight),
    };
  });
  expect(anchored.userOffset).toBeLessThanOrEqual(24);
  expect(anchored.distance).toBeGreaterThan(0);

  /* A delta far larger than the reserved room: the tail must stay visible
     (sticky bottom) even though the prompt-anchor row is still mounted. */
  await page.evaluate(() => window.__pushDelta('Long streamed content keeps arriving. '.repeat(70)));
  await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(4);
  expect(await page.evaluate(() => window.stateStore.read("_userScrolledAway"))).toBe(false);
  const tailVisible = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const live = list.querySelector('.tool-run-prose.is-live');
    if (!live) return true;
    return live.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 1;
  });
  expect(tailVisible).toBe(true);

  await page.evaluate(() => window.__finishStream());
  await page.waitForTimeout(200);
});
