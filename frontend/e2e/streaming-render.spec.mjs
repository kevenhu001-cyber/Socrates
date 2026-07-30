import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function prepareDelayedStream(page, options = {}) {
  const delay = options.delay || 150;
  const finishDelay = options.finishDelay || 1000;
  await page.evaluate(async ({ delay, finishDelay }) => {
    const originalFetch = window.fetch.bind(window);
    const deltas = [
      '# Stable heading\n\nThe live tail begins',
      ' and keeps growing without replacing',
      ' the completed heading. This response',
      ' contains enough text to exercise the',
      ' adaptive streaming cadence and pinned',
      ' scrolling behavior across multiple',
      ' visual updates while the network sends',
      ' small chunks. The final Markdown remains correct.',
    ];
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!/\/api\/(?:v2\/)?chat\/stream/.test(url)) return originalFetch(input, init);
      const encoder = new TextEncoder();
      let timer = null;
      const stream = new ReadableStream({
        start(controller) {
          let index = 0;
          const push = () => {
            if (index < deltas.length) {
              const payload = { choices: [{ delta: { content: deltas[index++] } }] };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
              timer = setTimeout(push, index === deltas.length ? finishDelay : delay);
              return;
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          };
          timer = setTimeout(push, delay);
        },
        cancel() { if (timer) clearTimeout(timer); },
      });
      return Promise.resolve(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };

    window.state.phase = 'chat';
    window.state.currentSessionId = '77777777-7777-4777-8777-777777777777';
    window.state.messages = [{ clientId: 'user-stream', role: 'user', rawText: 'Stream smoothly', html: null }];
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
    window.__smoothStreamPromise = window.askChatTurn('Stream smoothly');
  }, { delay, finishDelay });
}

async function waitForStreamHandoff(page) {
  await page.waitForFunction(() => {
    const id = window.state.messages.at(-1)?.clientId;
    if (!id) return false;
    return document.querySelector(`[data-client-id="${id}"][data-react-owned]`)
      && !Array.from(document.querySelectorAll(`[data-client-id="${id}"]`))
        .some((node) => !node.hasAttribute('data-react-owned'));
  });
}

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
});

test('streaming keeps settled Markdown mounted and follows a pinned reader', async ({ page }) => {
  await prepareDelayedStream(page);

  const bubble = page.locator('.msg.assistant').last();
  /* CI intentionally runs without third-party CDN globals, so Markdown
     falls back to a paragraph here. The invariant under test is that the
     settled block itself stays mounted while the tail changes. */
  const heading = bubble.locator('.stream-settled-content > *');
  await expect(heading).toContainText('Stable heading');
  expect(await page.evaluate(() => {
    window.__settledHeading = document.querySelector('.stream-settled-content')?.firstElementChild;
    return Boolean(window.__settledHeading);
  })).toBe(true);

  await expect(bubble.locator('.stream-live-content')).toContainText('adaptive streaming cadence');
  expect(await page.evaluate(() => {
    const current = document.querySelector('.stream-settled-content')?.firstElementChild;
    return current === window.__settledHeading;
  })).toBe(true);
  await expect(bubble.locator('.stream-live-content')).toContainText('The final Markdown remains c');
  expect(await page.evaluate(() => {
    window.__settledHeadingAtFinish = document.querySelector('.stream-settled-content')?.firstElementChild;
    return Boolean(window.__settledHeadingAtFinish);
  })).toBe(true);

  await expect.poll(() => page.evaluate(() => {
    const list = document.getElementById('msgList');
    return Math.round(list.scrollHeight - list.scrollTop - list.clientHeight);
  })).toBeLessThanOrEqual(2);

  await page.evaluate(() => window.__smoothStreamPromise);
  await waitForStreamHandoff(page);
  await expect(bubble).toContainText('Stable heading');
  await expect(bubble).toContainText('The final Markdown remains correct.');
  await expect(bubble.locator('.stream-cursor')).toHaveCount(0);
  expect(await page.evaluate(() => {
    const id = window.state.messages.at(-1)?.clientId;
    const current = id
      ? document.querySelector(`[data-client-id="${id}"][data-react-owned] .stream-settled-content`)?.firstElementChild
      : null;
    return current === window.__settledHeadingAtFinish
      && Boolean(window.__settledHeadingAtFinish?.isConnected);
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const list = document.getElementById('msgList');
    return Math.round(list.scrollHeight - list.scrollTop - list.clientHeight);
  })).toBeLessThanOrEqual(2);
});

test('streaming respects an intentional scroll-away', async ({ page }) => {
  await prepareDelayedStream(page, { delay: 180 });
  const bubble = page.locator('.msg.assistant').last();
  await expect(bubble.locator('.stream-live-content')).toContainText('keeps growing');

  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = 0;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.state._userScrolledAway)).toBe(true);
  await expect(bubble.locator('.stream-live-content')).toContainText('pinned scrolling behavior');
  expect(await page.evaluate(() => document.getElementById('msgList').scrollTop)).toBeLessThan(8);
  await expect(page.locator('#newReplyPill')).toHaveClass(/visible/);
  await expect(bubble.locator('.stream-live-content')).toContainText('The final Markdown remains c');
  const beforeFinishTop = await page.evaluate(() => document.getElementById('msgList').scrollTop);

  await page.evaluate(() => window.__smoothStreamPromise);
  await waitForStreamHandoff(page);
  const afterFinishTop = await page.evaluate(() => document.getElementById('msgList').scrollTop);
  expect(Math.abs(afterFinishTop - beforeFinishTop)).toBeLessThanOrEqual(2);
});

/* P_anchor-finish — when the reader scrolls UP into the streaming
   bubble mid-stream (not pinned, not at the very top), the
   finish() handoff must keep them on the same row instead of
   snapping to distance-from-bottom zero — which is the
   "jumped back to the start of the answer" symptom. The legacy
   bubble is taller than the React bubble in this fixture (it
   carries the streaming placeholder chrome that React doesn't
   duplicate), so the previous scrollTop = scrollHeight -
   clientHeight - distanceFromBottom math produced scrollTop=0
   every time. */
test('finish preserves mid-message scroll position (row anchor)', async ({ page }) => {
  await prepareDelayedStream(page, { delay: 80 });

  // Wait for streaming to begin — the streaming bubble carries
  // .stream-live-content. The 24 pre-existing assistant messages
  // don't, so the locator uniquely selects the new bubble.
  const bubble = page.locator('.msg.assistant').filter({ has: page.locator('.stream-live-content') });
  await expect(bubble).toHaveCount(1);
  await expect(bubble.locator('.stream-live-content')).toContainText('keeps growing');

  // Scroll the streaming bubble's TOP into the scroller's viewport
  // (user is reading the START of the AI's answer). Measure the
  // bubble's offset relative to the scroller (not the page viewport
  // — the scroller is offset from the page top by header/sidebar
  // chrome). This is the case the pre-existing "scrollTop=0" test
  // does NOT cover — and where the legacy distance-from-bottom math
  // falls apart: legacy bubble is taller than React bubble, so the
  // math result for "preserve distance-from-bottom" lands the user
  // at the very top of the scroller. The row-anchor restore avoids
  // this by tracking which row was at the scroller's viewport top.
  const before = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const b = document.querySelector('.msg.assistant .stream-live-content')?.closest('.msg.assistant');
    if (!b) throw new Error('streaming bubble missing');
    list.scrollTop = b.offsetTop;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
    const lr = list.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return {
      listTop: Math.round(list.scrollTop),
      maxScrollTop: Math.round(list.scrollHeight - list.clientHeight),
      bubbleOffsetFromScroller: Math.round(br.top - lr.top),
    };
  });

  await page.evaluate(() => window.__smoothStreamPromise);
  // Wait for the React commit + handoff + async mounts to settle.
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const b = document.querySelector('.msg.assistant[data-react-owned]')
      || document.querySelector('.msg.assistant:last-child');
    if (!b) return { bubbleOffsetFromScroller: null, listTop: null };
    const lr = list.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return {
      listTop: Math.round(list.scrollTop),
      maxScrollTop: Math.round(list.scrollHeight - list.clientHeight),
      bubbleOffsetFromScroller: Math.round(br.top - lr.top),
    };
  });

  // The bug: listTop goes to ~0 (the user is dumped at the top of
  // the scroller — "jumped back to the start of the answer"). The
  // fix keeps the bubble anchored near the scroller's viewport top.
  // We assert bubbleOffsetFromScroller stays close to its captured
  // value (was 0 before scroll, should stay close to 0 after finish).
  // 60px slack for height delta between legacy/React bubbles and
  // async mermaid/viz mounts.
  expect(after.bubbleOffsetFromScroller).not.toBeNull();
  expect(
    Math.abs(after.bubbleOffsetFromScroller - before.bubbleOffsetFromScroller),
    JSON.stringify({ before, after }),
  ).toBeLessThan(60);
});
