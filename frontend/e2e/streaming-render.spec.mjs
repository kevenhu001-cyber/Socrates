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

    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: '77777777-7777-4777-8777-777777777777' });
    /* A tall transcript, through state.messages: #msgList is React-owned, so
       foreign nodes appended to it are not something the renderer promises to
       keep — and the scroll maths below only mean something if the height
       comes from what is actually rendered. */
    const earlier = [];
    for (let i = 0; i < 24; i += 1) {
      const text = `Earlier message ${i}: ${'context '.repeat(12)}`;
      earlier.push({ clientId: 'pre-' + i, role: 'assistant', rawText: text, html: `<p>${text}</p>`, type: null });
    }
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'user-stream', role: 'user', rawText: 'Stream smoothly', html: null }, ...earlier] });
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
    window.stateStore.dispatch({ type: "state/set", key: "_userScrolledAway", value: false });
  }, { delay, finishDelay });
}

async function waitForStreamHandoff(page) {
  await page.waitForFunction(() => {
    const id = window.stateStore.read("messages").at(-1)?.clientId;
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
    const id = window.stateStore.read("messages").at(-1)?.clientId;
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
  /* P_finish-stream-boundary — the bubble tree stays mounted across the
     finish() handoff; the cursor is removed (not just hidden) once
     `isLive` flips, but the test also allows a brief cross-fade window
     during which the row still has the cursor in the DOM with opacity 0. */
  await expect.poll(() => bubble.locator('.stream-cursor').count(), { timeout: 600 })
    .toBe(0);
  expect(await page.evaluate(() => {
    const id = window.stateStore.read("messages").at(-1)?.clientId;
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
  await expect.poll(() => page.evaluate(() => window.stateStore.read("_userScrolledAway"))).toBe(true);
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

/* P_h3-cjk-contrast — an `### 标题` heading must read as a heading in
   Chinese, not as body text. The previous .msg-body h3 (font-size 1.05em,
   weight 500, --text-100) was visually indistinguishable from <p> in
   dark mode on Chinese characters. Bumping to 1.18em + weight 600 +
   --text-000 makes the heading stand out. The DOM tag is rendered by
   formatMsg (covered by streaming.test.mjs); this test guards the
   visual contrast instead. */
test('markdown h3 heading is visually distinct from body text', async ({ page }) => {
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
  });
  await page.evaluate(() => {
    window.addMessage?.('assistant',
      '我们用两种方法求解这个问题：\n\n' +
      '### 方法 1：特征方程法\n\n' +
      '建立特征方程 $r^2 - 2r + 1 = 0$，\n\n' +
      '可以解出 $r = 1$ 是二重根。',
    );
  });
  await expect(page.locator('#msgList .msg.assistant .msg-body h3')).toHaveCount(1);
  const metrics = await page.evaluate(() => {
    const body = document.querySelector('#msgList .msg.assistant .msg-body');
    const heading = body?.querySelector('h3');
    const paragraph = body?.querySelector('p');
    if (!heading || !paragraph) return null;
    const h = getComputedStyle(heading);
    const p = getComputedStyle(paragraph);
    return {
      headingSize: parseFloat(h.fontSize),
      headingWeight: parseInt(h.fontWeight, 10),
      headingColor: h.color,
      bodySize: parseFloat(p.fontSize),
      bodyColor: p.color,
      headingText: heading.textContent,
    };
  });
  expect(metrics).not.toBeNull();
  expect(metrics.headingText).toContain('方法 1：特征方程法');
  /* Heading must be at least 10% larger than the body text in em units.
     The previous 1.05em failed this — Chinese characters at that delta
     read as the same line of text. */
  expect(metrics.headingSize).toBeGreaterThanOrEqual(metrics.bodySize * 1.1);
  /* Heading weight must be heavier than the body's (typically 400).
     600 vs 400 is a clear, perceptible bump; 500 vs 400 was barely
     distinguishable on CJK glyphs. */
  expect(metrics.headingWeight).toBeGreaterThanOrEqual(600);
});

/* P_anchor-finish — when the reader is looking at the top of the streaming
   answer when finish() lands, the handoff must keep them on the same row
   instead of snapping to distance-from-bottom zero — which is the "jumped
   back to the start of the answer" symptom. Distance-from-bottom maths is
   what used to fail here: the finalized turn is a different height than the
   streaming one (the running row folds into its group, the status line
   retires), so "preserve distance-from-bottom" produced scrollTop=0 every
   time. the row-anchor restore avoids this by tracking which row was at the
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
