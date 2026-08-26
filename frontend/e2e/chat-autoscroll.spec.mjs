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
    window.state.phase = 'chat';
    window.state.currentSessionId = '88888888-8888-4888-8888-888888888888';
    window.state.messages = [{ clientId: 'user-scroll', role: 'user', rawText: 'Scroll smoothly', html: null }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');

    const list = document.getElementById('msgList');
    for (let i = 0; i < 24; i += 1) {
      const msg = document.createElement('div');
      msg.className = 'msg assistant';
      msg.innerHTML = `<div class="msg-body">Earlier message ${i}: ${'context '.repeat(12)}</div>`;
      list.appendChild(msg);
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    list.scrollTop = list.scrollHeight;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    window.state._userScrolledAway = false;
    window.__streamPromise = window.askChatTurn('Scroll smoothly');
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

  // Push the first delta so the streaming surface (.stream-live-content)
  // mounts, then bind the streaming bubble.
  await page.evaluate(() => window.__pushDelta('The answer begins and keeps growing. '));
  const bubble = page.locator('.msg.assistant').filter({ has: page.locator('.stream-live-content') });
  await expect(bubble).toHaveCount(1);

  // A pinned reader should keep the newest content in view —
  // distance-from-bottom stays within the pin slack. (The live tail
  // renders with a typewriter cadence, so assert on its leading text
  // rather than a specific trailing word.)
  await expect(bubble.locator('.stream-live-content')).toContainText('The answer begins');
  await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(4);

  // Push a large delta that forces the scroller to grow well past one
  // viewport; the pinned reader is followed to the new bottom.
  await page.evaluate(() => window.__pushDelta('It adds several more lines of streamed content to force the scroller to grow well past a single viewport height while the reader remains pinned. '.repeat(6)));
  await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(4);

  // The scroll-away flag must remain clear for a pinned reader.
  expect(await page.evaluate(() => window.state._userScrolledAway)).toBe(false);
  await expect(page.locator('#newReplyPill')).not.toHaveClass(/visible/);

  await page.evaluate(() => window.__finishStream());
  await page.evaluate(() => window.__streamPromise);
});

test('upward gesture stops auto-scroll and shows the new-reply pill; clicking it re-pins', async ({ page }) => {
  await bootStreamingChat(page);

  // Prime the stream so the streaming surface mounts, then confirm the
  // reader starts pinned.
  await page.evaluate(() => window.__pushDelta('The answer begins and keeps growing with enough content to overflow the scroller. '.repeat(3)));
  const bubble = page.locator('.msg.assistant').filter({ has: page.locator('.stream-live-content') });
  await expect(bubble).toHaveCount(1);
  await expect(bubble.locator('.stream-live-content')).toContainText('The answer begins');
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
  await expect.poll(() => page.evaluate(() => window.state._userScrolledAway)).toBe(true);
  const distanceAfterGesture = await distanceFromBottom(page);
  expect(distanceAfterGesture).toBeGreaterThan(64);

  await page.evaluate(() => window.__pushDelta('More streamed content arrives while the reader has scrolled away and should not be dragged back down. '.repeat(3)));
  // The reader was NOT re-pinned by the new delta (auto-scroll stopped).
  await expect.poll(() => distanceFromBottom(page)).toBeGreaterThan(64);

  // The "↓ new response" pill becomes visible while scrolled away.
  await expect(page.locator('#newReplyPill')).toHaveClass(/visible/);

  // Clicking the pill clears the scrolled-away flag and snaps to bottom.
  await page.locator('#newReplyPill').click();
  await expect.poll(() => page.evaluate(() => window.state._userScrolledAway)).toBe(false);
  await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(4);
  await expect(page.locator('#newReplyPill')).not.toHaveClass(/visible/);

  await page.evaluate(() => window.__finishStream());
  await page.evaluate(() => window.__streamPromise);
});
