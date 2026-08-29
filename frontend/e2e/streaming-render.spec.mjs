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
    /* A tall transcript, through state.messages: #msgList is React-owned, so
       foreign nodes appended to it are not something the renderer promises to
       keep — and the scroll maths below only mean something if the height
       comes from what is actually rendered. */
    const earlier = [];
    for (let i = 0; i < 24; i += 1) {
      const text = `Earlier message ${i}: ${'context '.repeat(12)}`;
      earlier.push({ clientId: 'pre-' + i, role: 'assistant', rawText: text, html: `<p>${text}</p>`, type: null });
    }
    window.state.messages = [{ clientId: 'user-stream', role: 'user', rawText: 'Stream smoothly', html: null }, ...earlier];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');

    const list = document.getElementById('msgList');
    /* Start the turn first, then wait for the send-time anchor to settle: while
       scheduleActiveTurnToTop holds the prompt at the top of the viewport,
       "pinned to the bottom" is a position the app is deliberately not at yet. */
    window.__smoothStreamPromise = window.askChatTurn('Stream smoothly');
    await new Promise((resolve) => {
      const wait = () => {
        if (list.querySelector('.msg.assistant[data-viewport-anchor]')) return resolve();
        requestAnimationFrame(wait);
      };
      wait();
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    list.scrollTop = list.scrollHeight;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    window.state._userScrolledAway = false;
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
  const heading = bubble.locator('.tool-run-prose.is-settled > *');
  await expect(heading).toContainText('Stable heading');
  expect(await page.evaluate(() => {
    window.__settledHeading = document.querySelector('.tool-run-prose.is-settled')?.firstElementChild;
    return Boolean(window.__settledHeading);
  })).toBe(true);

  await expect(bubble.locator('.tool-run-prose.is-live')).toContainText('adaptive streaming cadence');
  expect(await page.evaluate(() => {
    const current = document.querySelector('.tool-run-prose.is-settled')?.firstElementChild;
    return current === window.__settledHeading;
  })).toBe(true);
  await expect(bubble.locator('.tool-run-prose.is-live')).toContainText('The final Markdown remains c');
  /* The row element itself must survive the finish() handoff: the declarative
     turn re-renders its prose in place instead of swapping the bubble (that
     transplant is what used to jump the scroll and re-run the post-render
     hooks). The prose *segment* does change class when the last block settles,
     so identity is checked on the row, not on the settled div. */
  expect(await page.evaluate(() => {
    const id = window.state.messages.at(-1)?.clientId;
    window.__streamRow = id ? document.querySelector(`[data-client-id="${id}"]`) : null;
    return Boolean(window.__streamRow);
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
    const current = id ? document.querySelector(`[data-client-id="${id}"]`) : null;
    return current === window.__streamRow && Boolean(current?.isConnected);
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const list = document.getElementById('msgList');
    return Math.round(list.scrollHeight - list.scrollTop - list.clientHeight);
  })).toBeLessThanOrEqual(2);
});

test('streaming respects an intentional scroll-away', async ({ page }) => {
  await prepareDelayedStream(page, { delay: 180 });
  const bubble = page.locator('.msg.assistant').last();
  await expect(bubble.locator('.tool-run-prose.is-live')).toContainText('keeps growing');

  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = 0;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.state._userScrolledAway)).toBe(true);
  await expect(bubble.locator('.tool-run-prose.is-live')).toContainText('pinned scrolling behavior');
  expect(await page.evaluate(() => document.getElementById('msgList').scrollTop)).toBeLessThan(8);
  await expect(page.locator('#newReplyPill')).toHaveClass(/visible/);
  await expect(bubble.locator('.tool-run-prose.is-live')).toContainText('The final Markdown remains c');
  const beforeFinishTop = await page.evaluate(() => document.getElementById('msgList').scrollTop);

  await page.evaluate(() => window.__smoothStreamPromise);
  await waitForStreamHandoff(page);
  const afterFinishTop = await page.evaluate(() => document.getElementById('msgList').scrollTop);
  expect(Math.abs(afterFinishTop - beforeFinishTop)).toBeLessThanOrEqual(2);
});

/* P_anchor-finish — when the reader is looking at the top of the streaming
   answer when finish() lands, the handoff must keep them on the same row
   instead of snapping to distance-from-bottom zero — which is the "jumped
   back to the start of the answer" symptom. Distance-from-bottom maths is
   what used to fail here: the finalized turn is a different height than the
   streaming one (the running row folds into its group, the status line
   retires), so "preserve distance-from-bottom" produced scrollTop=0 every
   time. The row-anchor restore avoids this by tracking which row was at the
   scroller's viewport top. */
test('finish preserves mid-message scroll position (row anchor)', async ({ page }) => {
  await prepareDelayedStream(page, { delay: 80 });

  // Wait for streaming to begin — the streaming bubble carries
  // .tool-run-prose.is-live. The 24 pre-existing assistant messages
  // don't, so the locator uniquely selects the new bubble.
  const bubble = page.locator('.msg.assistant').filter({ has: page.locator('.tool-run-prose.is-live') });
  await expect(bubble).toHaveCount(1);
  await expect(bubble.locator('.tool-run-prose.is-live')).toContainText('keeps growing');

  // Put the streaming row's TOP at the scroller's viewport edge — the
  // reader is at the start of the answer. Measure relative to the
  // scroller, not the page viewport: the scroller itself is offset by the
  // header chrome.
  const before = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const b = document.querySelector('.msg.assistant .tool-run-prose.is-live')?.closest('.msg.assistant');
    if (!b) throw new Error('streaming bubble missing');
    list.scrollTop = b.offsetTop;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
    const lr = list.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return {
      clientId: b.dataset.clientId,
      listTop: Math.round(list.scrollTop),
      maxScrollTop: Math.round(list.scrollHeight - list.clientHeight),
      bubbleOffsetFromScroller: Math.round(br.top - lr.top),
    };
  });
  expect(before.clientId, 'the streaming row is the one under test').toBeTruthy();

  await page.evaluate(() => window.__smoothStreamPromise);
  // Wait for the React commit + handoff + async mounts to settle.
  await page.waitForTimeout(500);

  /* Track the row by id, not by "the first React-owned assistant": every
     message in this fixture renders through React, so a positional selector
     would measure one of the filler turns instead. */
  const after = await page.evaluate((clientId) => {
    const list = document.getElementById('msgList');
    const b = document.querySelector(`.msg.assistant[data-client-id="${clientId}"]`);
    if (!b) return { bubbleOffsetFromScroller: null, listTop: null };
    const lr = list.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return {
      listTop: Math.round(list.scrollTop),
      maxScrollTop: Math.round(list.scrollHeight - list.clientHeight),
      bubbleOffsetFromScroller: Math.round(br.top - lr.top),
    };
  }, before.clientId);

  // The bug: listTop goes to ~0 (the user is dumped at the top of
  // the scroller — "jumped back to the start of the answer"). The fix
  // keeps this row anchored at the same distance from the viewport top.
  // 60px slack covers the finalize-time height delta (the running row
  // folding into its group, the status line retiring) plus async
  // mermaid/viz mounts.
  expect(after.bubbleOffsetFromScroller).not.toBeNull();
  expect(
    Math.abs(after.bubbleOffsetFromScroller - before.bubbleOffsetFromScroller),
    JSON.stringify({ before, after }),
  ).toBeLessThan(60);
});
