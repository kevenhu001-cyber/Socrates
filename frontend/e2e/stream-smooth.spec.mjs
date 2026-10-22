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
 *   4. paced publication adds bounded, time-anchored opacity reveals only to
 *      new tail text, and settled blocks remain stable.
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
              window.__smoothArrivedAt = performance.now();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
              timer = setTimeout(push, gapMs);
              return;
            }
            // Optionally hold the SSE open (no more deltas) to exercise a stall
            // with an empty buffer before [DONE].
            timer = setTimeout(() => {
              window.__smoothDoneAt = performance.now();
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

for (const holdOpenMs of [2000, 0]) {
  test(`large burst bounds display lag, DONE hold ${holdOpenMs}ms`, async ({ page }, info) => {
    const text = '快速回复应及时显示，不能积压在播放队列里。'.repeat(500);
    await page.evaluate((text) => {
      window.__burstProbe = {};
      const started = performance.now();
      const sample = () => {
        const row = document.querySelector('#msgList .msg.assistant:last-of-type');
        if ((row?.querySelector('.msg-body')?.textContent || '').includes(text)) {
          window.__burstProbe.paintedAt ??= performance.now();
        }
        if (window.__burstProbe.paintedAt && row?.dataset.streamSettled === 'true') {
          window.__burstProbe.settledAt = performance.now();
          return;
        }
        if (performance.now() - started < 6000) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, text);
    await startStream(page, { deltas: [text], gapMs: 50, holdOpenMs });
    await expect.poll(() => page.evaluate(() => window.__burstProbe.settledAt), { timeout: 6000 }).toBeTruthy();
    const timing = await page.evaluate(() => ({
      arrivalToPaintMs: window.__burstProbe.paintedAt - window.__smoothArrivedAt,
      doneToSettledMs: window.__burstProbe.settledAt - window.__smoothDoneAt,
    }));
    await info.attach('burst-latency', { body: JSON.stringify(timing), contentType: 'application/json' });
    expect(timing.arrivalToPaintMs).toBeLessThan(500);
    expect(timing.doneToSettledMs).toBeLessThan(500);
    await expect(page.locator('#msgList .msg.assistant').last()).toContainText(text);
    if (holdOpenMs === 0) await page.screenshot({ path: 'test-results/stream-burst-finished.png' });
  });
}

test('a burst paces its opening and catches up once the display deadline expires', async ({ page }) => {
  // Capture the first DOM update inside the page. A later automation round
  // trip may arrive after the 120ms deadline, when catching up is required.
  const big = 'Lorem ipsum dolor sit amet '.repeat(60); // ~1600 chars in one burst
  await page.evaluate(() => {
    window.__smoothOpening = null;
    const observer = new MutationObserver(() => {
      const text = (document.querySelector('.tool-run-prose.is-live')?.textContent || '').trimEnd();
      if (!text.length) return;
      window.__smoothOpening = { length: text.length, at: performance.now() };
      observer.disconnect();
    });
    observer.observe(document.getElementById('msgList'), { subtree: true, childList: true, characterData: true });
  });
  await startStream(page, { deltas: [big], gapMs: 200, holdOpenMs: 12000 });

  const live = page.locator('.msg.assistant').last().locator('.tool-run-prose.is-live');
  await expect(live).toBeVisible();

  await expect.poll(() => page.evaluate(() => window.__smoothOpening)).toBeTruthy();
  const opening = await page.evaluate(() => ({ ...window.__smoothOpening,
    delayMs: window.__smoothOpening.at - window.__smoothArrivedAt,
  }));
  expect(opening.length).toBeGreaterThan(0);
  expect(opening.delayMs).toBeLessThan(500);
  // If the browser missed the pacing window, a full first paint is correct.
  if (opening.delayMs < 120) expect(opening.length).toBeLessThan(big.trimEnd().length);

  // It eventually catches up to the whole burst (measured on the bubble, since
  // once playback completes the tail is a settled block, not the live region).
  await expect.poll(async () => page.evaluate(
    () => (document.querySelector('.msg.assistant:last-of-type .msg-body')?.textContent || '').length,
  ), { timeout: 12000 }).toBeGreaterThanOrEqual(big.length - 2);
});

test('live prose softly reveals new chunks without animating whole paragraphs', async ({ page }) => {
  const para = 'Streaming text stays smooth because playback is paced before React paints the live tail. ';
  await startStream(page, {
    deltas: [para, para, para, para, para],
    gapMs: 250,
    holdOpenMs: 6000,
  });
  const live = page.locator('.msg.assistant').last().locator('.tool-run-prose.is-live');
  await expect(live).toBeVisible();
  await expect(live).toContainText('Streaming text stays smooth');

  // Bounded chunk decoration replaces the former unbounded per-character
  // walk. No geometry animation, nested wrappers, or whole-paragraph fade.
  expect(await page.locator('.tool-run-prose.is-live .stream-fade').count()).toBe(0);
  expect(await page.locator('.tool-run-prose.is-live .stream-char').count()).toBe(0);

  await expect.poll(() => live.locator('.stream-append-reveal').count()).toBeGreaterThan(0);
  const state = await live.evaluate((el) => ({
    spans: el.querySelectorAll('.stream-append-reveal').length,
    nested: el.querySelectorAll('.stream-append-reveal .stream-append-reveal').length,
    opacity: getComputedStyle(el).opacity,
    names: el.getAnimations({ subtree: true }).map((a) => a.animationName),
  }));
  expect(state.spans).toBeLessThanOrEqual(24);
  expect(state.nested).toBe(0);
  expect(state.opacity).toBe('1');
  expect(state.names.every((name) => name === 'stream-append-reveal')).toBe(true);
});

test('reduced motion displays streamed prose immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startStream(page, { deltas: ['中文流式输出立即可读，保留 **Markdown** 格式。'], gapMs: 100, holdOpenMs: 3000 });
  const live = page.locator('.msg.assistant').last().locator('.tool-run-prose.is-live');
  await expect(live).toContainText('中文流式输出');
  expect(await live.locator('.stream-append-reveal').count()).toBe(0);
  expect(await live.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
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
