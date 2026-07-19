import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function prepareDelayedStream(page, options = {}) {
  const delay = options.delay || 150;
  await page.evaluate(async ({ delay }) => {
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
              timer = setTimeout(push, delay);
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
  }, { delay });
}

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
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
  await page.evaluate(() => {
    window.__settledHeading = document.querySelector('.msg.assistant:last-child .stream-settled-content')?.firstElementChild;
  });

  await expect(bubble.locator('.stream-live-content')).toContainText('adaptive streaming cadence');
  expect(await page.evaluate(() => {
    const current = document.querySelector('.msg.assistant:last-child .stream-settled-content')?.firstElementChild;
    return current === window.__settledHeading;
  })).toBe(true);

  await expect.poll(() => page.evaluate(() => {
    const list = document.getElementById('msgList');
    return Math.round(list.scrollHeight - list.scrollTop - list.clientHeight);
  })).toBeLessThanOrEqual(2);

  await page.evaluate(() => window.__smoothStreamPromise);
  await expect(bubble).toContainText('Stable heading');
  await expect(bubble).toContainText('The final Markdown remains correct.');
  await expect(bubble.locator('.stream-cursor')).toHaveCount(0);
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

  await page.evaluate(() => window.__smoothStreamPromise);
  expect(await page.evaluate(() => document.getElementById('msgList').scrollTop)).toBeLessThan(8);
});
