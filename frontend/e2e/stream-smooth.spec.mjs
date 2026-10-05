import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/**
 * P_smooth-stream — the playback clock decouples network arrival from visual
 * playback. These specs assert the reader-facing consequences:
 *   1. a single upstream BURST is revealed gradually (visible < arrived for a
 *      while), never dumped in one frame;
 *   2. an upstream STALL with an empty buffer shows the starved cursor (one
 *      slowed dot) rather than freezing or fabricating content;
 *   3. the kill switch restores the old "paint everything" behaviour;
 *   4. new text fades in (opacity only), and a settled block never re-animates.
 */

async function startStream(page, { deltas, gapMs = 400, smooth = true, holdOpenMs = 0 }) {
  await page.evaluate(async ({ deltas, gapMs, smooth, holdOpenMs }) => {
    window.__socratesSmoothStream = smooth;
    const originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
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
              timer = setTimeout(push, gapMs);
              return;
            }
            // Optionally hold the SSE open (no more deltas) to exercise a stall
            // with an empty buffer before [DONE].
            timer = setTimeout(() => {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }, holdOpenMs);
          };
          timer = setTimeout(push, gapMs);
        },
        cancel() { if (timer) clearTimeout(timer); },
      });
      return Promise.resolve(new Response(stream, {
        status: 200, headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '88888888-8888-4888-8888-888888888888' });
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [
      { clientId: 'user-smooth', role: 'user', rawText: 'Go', html: null },
    ] });
    window.__testActivateMainView('chatView');
    window.__smoothPromise = window.askChatTurn('Go');
  }, { deltas, gapMs, smooth, holdOpenMs });
}

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
});

test('a large burst is revealed gradually, not dumped in one frame', async ({ page }) => {
  // One giant delta arrives at once. With smoothing the visible length must
  // trail the arrived length for at least one measurable moment.
  const big = 'Lorem ipsum dolor sit amet '.repeat(60); // ~1600 chars in one burst
  await startStream(page, { deltas: [big], gapMs: 200, holdOpenMs: 12000 });

  const live = page.locator('.msg.assistant').last().locator('.tool-run-prose.is-live');
  await expect(live).toBeVisible();

  // Sample the visible length shortly after the burst arrives: it must be
  // well under the full arrived length (the burst is being played out).
  const midway = await page.evaluate(async () => {
    const read = () => (document.querySelector('.tool-run-prose.is-live')?.textContent || '').length;
    const start = performance.now();
    while (read() === 0 && performance.now() - start < 3000) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    return read();
  });
  expect(midway).toBeGreaterThan(0);
  expect(midway).toBeLessThan(big.length);

  // It eventually catches up to the whole burst (measured on the bubble, since
  // once playback completes the tail is a settled block, not the live region).
  await expect.poll(async () => page.evaluate(
    () => (document.querySelector('.msg.assistant:last-of-type .msg-body')?.textContent || '').length,
  ), { timeout: 12000 }).toBeGreaterThanOrEqual(big.length - 2);
});

test('freshly revealed text fades in with opacity only, as inline runs', async ({ page }) => {
  await startStream(page, {
    deltas: ['Streaming text fades in softly at the tail, the way chatgpt.com reveals an answer while it is written.'],
    gapMs: 200,
    holdOpenMs: 4000,
  });
  const live = page.locator('.msg.assistant').last().locator('.tool-run-prose.is-live');
  await expect(live).toBeVisible();
  // While the tail is still being revealed, fade runs exist …
  await expect.poll(() => page.evaluate(
    () => document.querySelectorAll('.tool-run-prose.is-live .stream-fade').length,
  ), { timeout: 4000 }).toBeGreaterThan(0);
  // … and they never move or blur the glyphs, nor break the line box.
  const style = await page.evaluate(() => {
    const el = document.querySelector('.tool-run-prose.is-live .stream-fade');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { display: cs.display, transform: cs.transform, filter: cs.filter, delay: el.style.animationDelay };
  });
  expect(style).not.toBeNull();
  expect(style.display).toBe('inline');
  expect(style.transform).toBe('none');
  expect(style.filter).toBe('none');
  // Anchored to reveal time: a rebuilt tail resumes the fade mid-way.
  expect(style.delay).toMatch(/^-?\d+(\.\d+)?ms$/);
  // The old per-glyph wrapper is gone.
  expect(await page.locator('.stream-char').count()).toBe(0);
});

test('a paragraph that settles mid-stream does not replay an entrance animation', async ({ page }) => {
  await startStream(page, {
    deltas: ['First paragraph settles here.\n\n', 'Second paragraph keeps growing while the first stays put.'],
    gapMs: 250,
    holdOpenMs: 4000,
  });
  const settled = page.locator('.msg.assistant').last().locator('.tool-run-prose.is-settled').first();
  await expect(settled).toBeVisible({ timeout: 6000 });
  // Sample the settled block over several frames: no running animation and
  // full opacity on every frame — the reader never sees it fade in again.
  const samples = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 12; i++) {
      const el = document.querySelector('.msg.assistant:last-of-type .tool-run-prose.is-settled');
      if (el) {
        const child = el.firstElementChild || el;
        out.push({
          anims: el.getAnimations({ subtree: true }).length,
          opacity: Number(getComputedStyle(child).opacity),
        });
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  });
  expect(samples.length).toBeGreaterThan(0);
  for (const s of samples) {
    expect(s.anims).toBe(0);
    expect(s.opacity).toBe(1);
  }
});

test('an upstream stall with an empty buffer keeps a single slowed cursor dot', async ({ page }) => {
  // A short first delta drains quickly; then the stream holds open with no
  // further deltas, so the playback buffer empties and the clock goes starved.
  await startStream(page, { deltas: ['Hi'], gapMs: 200, holdOpenMs: 5000 });
  const bubble = page.locator('.msg.assistant').last();
  await expect(bubble.locator('.tool-run-prose.is-live')).toContainText('Hi');
  await expect(bubble.locator('.stream-cursor.is-starved')).toHaveCount(1, { timeout: 4000 });
  // One dot, no three-dot ellipsis.
  expect(await bubble.locator('.stream-cursor .stream-dots').count()).toBe(0);
  expect(await bubble.locator('.stream-cursor').count()).toBe(1);
});

test('kill switch paints the whole arrived text immediately', async ({ page }) => {
  const text = 'The kill switch disables smooth playback entirely.';
  await startStream(page, { deltas: [text], gapMs: 150, holdOpenMs: 3000, smooth: false });
  const live = page.locator('.msg.assistant').last().locator('.tool-run-prose.is-live');
  // With smoothing off, the first paint after the delta already carries the
  // whole arrived text — no gradual reveal window.
  await expect(live).toContainText('disables smooth playback entirely');
});
