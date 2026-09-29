// e2e/chat-send-glide.spec.mjs — the send glide in every reader situation.
//
// Whatever the reader was looking at when they pressed send — a transcript
// that does not fill the screen, the bottom of a full one, or the very first
// message of a long session — and whether or not an answer was still
// streaming, the transcript must glide (never jump) to the submitted prompt
// and settle it at the top offset (chat/turnAnchor.ts TURN_ANCHOR_TOP_OFFSET).
//
// Each case samples, on every animation frame from the submit until the send
// anchor releases (`data-turn-anchor-settling` cleared) plus a short tail,
// where the NEW prompt sits on screen (its offset from the transcript top).
// That is what the reader sees; raw scrollTop is not, because spent reserves
// above the viewport are retired with a 1:1 scrollTop compensation that
// leaves the picture untouched. The spec asserts:
//   - monotonic: the prompt only ever travels up toward its slot — no frame
//     moves it back down by more than 2px (no competing scroll writer, no
//     end-of-glide correction snap, no answer growing above it);
//   - animated: a glide covering real distance spans at least 8 frames;
//   - settled: the prompt ends 12±2px below the transcript top.

import { test } from './_lib.mjs';
import { expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* Controllable SSE stream (same shape as chat-autoscroll.spec.mjs). Every
   stream request gets its own push/finish pair; the latest one is exposed
   as window.__pushDelta / window.__finishStream, and all of them are kept
   in window.__streams so an earlier answer can keep streaming while the
   next prompt is sent. */
function installControllableStream(page) {
  return page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.__streams = [];
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!/\/api\/(?:v2\/)?chat\/stream/.test(url)) return nativeFetch(input, init);
      const encoder = new TextEncoder();
      let controllerRef;
      let closed = false;
      const body = new ReadableStream({
        start(controller) { controllerRef = controller; },
        cancel() { closed = true; },
      });
      /* Behave like a real fetch: a superseded turn aborts its request
         (chat/turnController.js), which errors the body and stops deltas. */
      const signal = init && init.signal;
      if (signal) {
        signal.addEventListener('abort', () => {
          if (closed) return;
          closed = true;
          try { controllerRef.error(new DOMException('Aborted', 'AbortError')); } catch (_) { /* already closed */ }
        });
      }
      const handle = {
        push(text) {
          if (closed) return;
          const payload = { choices: [{ delta: { content: text } }] };
          try { controllerRef.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); } catch (_) { closed = true; }
        },
        finish() {
          if (closed) return;
          closed = true;
          try {
            controllerRef.enqueue(encoder.encode('data: [DONE]\n\n'));
            controllerRef.close();
          } catch (_) { /* aborted by a newer turn */ }
        },
      };
      window.__streams.push(handle);
      window.__pushDelta = handle.push;
      window.__finishStream = handle.finish;
      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  });
}

async function bootChat(page, messageCount) {
  await page.evaluate((count) => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '77777777-7777-4777-8777-777777777777' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    for (let i = 0; i < count; i += 1) {
      window.addMessage(i % 2 ? 'assistant' : 'user', `Glide history ${i + 1}: ${'context '.repeat(i % 2 ? 40 : 10)}`);
    }
  }, messageCount);
  if (messageCount) await expect(page.locator('#msgList .msg')).toHaveCount(messageCount);
}

/* Put the reader where the scenario says. */
async function placeReader(page, where) {
  await page.evaluate((position) => {
    const list = document.getElementById('msgList');
    if (position === 'history') {
      list.scrollTop = 0;
      window.stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: true });
    } else {
      list.scrollTop = list.scrollHeight;
      window.stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: false });
    }
  }, where);
  await page.waitForTimeout(250);
}

/* Start an answer that keeps streaming in the background: a delta every
   40ms until the test stops it. */
async function startBackgroundAnswer(page) {
  await page.evaluate(() => window.submitChatMessage('An answer that is still streaming'));
  await expect.poll(() => page.evaluate(() => window.__streams.length)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(
    () => document.getElementById('msgList').dataset.turnAnchorSettling === 'true',
  )).toBe(false);
  await page.evaluate(() => {
    const stream = window.__streams[window.__streams.length - 1];
    let n = 0;
    stream.push('Streaming answer begins. ');
    window.__bgTimer = setInterval(() => {
      n += 1;
      stream.push(`Line ${n} of the running answer keeps arriving while the reader acts. `);
      if (n % 4 === 0) stream.push('\n\n');
    }, 40);
  });
  await page.waitForTimeout(300);
}

/* Submit and sample every frame until the send anchor lets go, plus a
   20-frame tail so a late correction after the release is caught too. */
async function sendAndSample(page, text) {
  const samples = page.evaluate(() => new Promise((resolve) => {
    const list = document.getElementById('msgList');
    const initialUsers = list.querySelectorAll('.msg.user').length;
    const offsets = [];
    let sawSettling = false;
    let tail = 0;
    const deadline = performance.now() + 3500;
    const tick = () => {
      const users = list.querySelectorAll('.msg.user');
      if (users.length > initialUsers) {
        const prompt = users[users.length - 1];
        offsets.push(prompt.getBoundingClientRect().top - list.getBoundingClientRect().top);
      }
      if (list.dataset.turnAnchorSettling === 'true') sawSettling = true;
      if (sawSettling && list.dataset.turnAnchorSettling !== 'true') tail += 1;
      if (tail > 20 || performance.now() > deadline) {
        resolve({ offsets, sawSettling });
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }));
  await page.evaluate((prompt) => { void window.submitChatMessage(prompt); }, text);
  return samples;
}

async function promptOffset(page) {
  return page.evaluate(() => {
    const list = document.getElementById('msgList');
    const users = list.querySelectorAll('.msg.user');
    const latest = users[users.length - 1];
    return Math.round(latest.getBoundingClientRect().top - list.getBoundingClientRect().top);
  });
}

function assertGlide({ offsets, sawSettling }, { expectMotion }) {
  const trace = JSON.stringify(offsets.map((v) => Math.round(v)));
  expect(sawSettling, 'the send took scroll ownership').toBe(true);
  expect(offsets.length, 'the new prompt was sampled').toBeGreaterThan(0);
  for (let i = 1; i < offsets.length; i += 1) {
    expect(offsets[i], `frame ${i} pushed the prompt back down: ${trace}`).toBeLessThanOrEqual(offsets[i - 1] + 2);
  }
  if (expectMotion) {
    const start = offsets[0];
    const end = offsets[offsets.length - 1];
    expect(start - end, `glide distance: ${trace}`).toBeGreaterThan(100);
    /* Frames strictly between start and end prove it was animated. */
    const inFlight = offsets.filter((v) => v < start - 1 && v > end + 1).length;
    expect(inFlight, `animated frames: ${trace}`).toBeGreaterThanOrEqual(8);
  }
}

const VIEWPORTS = [
  { name: 'desktop', size: { width: 1280, height: 800 } },
  { name: 'mobile', size: { width: 390, height: 844 } },
];

const SCENARIOS = [
  { name: 'short transcript', messages: 2, where: 'bottom', motion: false },
  { name: 'full transcript at the bottom', messages: 30, where: 'bottom', motion: true },
  { name: 'reader deep in history', messages: 80, where: 'history', motion: true },
];

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await installControllableStream(page);
});

for (const vp of VIEWPORTS) {
  for (const scenario of SCENARIOS) {
    for (const streaming of [false, true]) {
      const label = `${vp.name}: ${scenario.name}, AI ${streaming ? 'streaming' : 'idle'} — send glides to the new prompt`;
      test(label, async ({ page }) => {
        await page.setViewportSize(vp.size);
        await gotoAndSettle(page, '/');
        await waitForAppShell(page);
        await bootChat(page, scenario.messages);
        if (streaming) {
          await placeReader(page, 'bottom');
          await startBackgroundAnswer(page);
        }
        await placeReader(page, scenario.where);

        const result = await sendAndSample(page, 'Take me to the newest prompt');
        await page.evaluate(() => clearInterval(window.__bgTimer));
        assertGlide(result, { expectMotion: scenario.motion });

        const offset = await promptOffset(page);
        expect(offset).toBeGreaterThanOrEqual(10);
        expect(offset).toBeLessThanOrEqual(14);
        const away = await page.evaluate(() => window.stateStore.read('_userScrolledAway'));
        expect(away).toBe(false);

        await page.evaluate(() => { for (const s of window.__streams) s.finish(); });
        await page.waitForTimeout(150);
      });
    }
  }
}

test('reduced motion: a send from deep history lands on the prompt without animating', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await bootChat(page, 80);
  await placeReader(page, 'history');
  const { offsets } = await sendAndSample(page, 'Reduced motion send');
  const start = offsets[0];
  const end = offsets[offsets.length - 1];
  const inFlight = offsets.filter((v) => v < start - 1 && v > end + 1).length;
  expect(inFlight, JSON.stringify(offsets.map(Math.round))).toBeLessThanOrEqual(2);
  const offset = await promptOffset(page);
  expect(offset).toBeGreaterThanOrEqual(10);
  expect(offset).toBeLessThanOrEqual(14);
  await page.evaluate(() => { for (const s of window.__streams) s.finish(); });
});
