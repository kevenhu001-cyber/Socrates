import { expect, test } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { buildLargeTranscript, routeLargeSessions } from './_large-session-fixture.mjs';

/* Large-history performance.
 *
 * Always on: a 2,000-message session (code, KaTeX, scaffolds, visualizations,
 * images) must open by asking the server for one tail page only, mount a
 * bounded first screen, and stay under a DOM-node ceiling. Those are
 * structural budgets — they do not depend on machine speed — plus one very
 * loose open-time ceiling that only catches order-of-magnitude regressions.
 *
 * PERF_REPORT=1 additionally runs the measurement matrix used for
 * perf-history-report.md (open/interactive time, scroll jank, memory,
 * streaming commit cost, session switch, input latency) at CPU x1 and x4.
 * PERF_BASELINE=1 records an older, unpaginated build: it reports the same
 * numbers and skips the pagination-specific assertions. */

const baseline = process.env.PERF_BASELINE === '1';
const report = process.env.PERF_REPORT === '1';
const SESSION_A = 'cccccccc-0000-4000-8000-00000000000a';
const SESSION_B = 'dddddddd-0000-4000-8000-00000000000b';
const p = (values, q) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)];
};
const round = (value) => Math.round(value * 10) / 10;

async function boot(page, count) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 860 });
  await mockAuthedApp(page);
  const log = await routeLargeSessions(page, [
    { id: SESSION_A, title: 'Large history A', messages: buildLargeTranscript(count, { seed: 'cccccccc' }) },
    { id: SESSION_B, title: 'Large history B', messages: buildLargeTranscript(count, { seed: 'dddddddd' }) },
  ]);
  await page.addInitScript(() => {
    window.__largePerf = { longTasks: [], events: [] };
    for (const [type, key] of [['longtask', 'longTasks'], ['event', 'events']]) {
      try {
        new PerformanceObserver((list) => {
          for (const item of list.getEntries()) window.__largePerf[key].push({
            name: item.name, startTime: item.startTime, duration: item.duration,
          });
        }).observe({ type, buffered: true, durationThreshold: 16 });
      } catch { /* empty-catch: intentional — Event Timing is optional */ }
    }
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);
  await page.waitForFunction(() => typeof window.loadSession === 'function', null, { timeout: 15_000 });
  return { errors, log };
}

/* Open a session and wait for the main thread to go quiet: "interactive" is
   the end of the last long task in the open window (or the open itself). */
async function openSession(page, id) {
  return page.evaluate(async (sessionId) => {
    const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const start = performance.now();
    await window.loadSession(sessionId);
    await frames();
    const openMs = performance.now() - start;
    let quietSince = performance.now();
    let seen = window.__largePerf.longTasks.length;
    const deadline = performance.now() + 8000;
    while (performance.now() < deadline && performance.now() - quietSince < 600) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (window.__largePerf.longTasks.length !== seen) {
        seen = window.__largePerf.longTasks.length;
        quietSince = performance.now();
      }
    }
    const tasks = window.__largePerf.longTasks.filter((task) => task.startTime >= start);
    const lastEnd = tasks.reduce((max, task) => Math.max(max, task.startTime + task.duration), start + openMs);
    return {
      openMs,
      interactiveMs: lastEnd - start,
      longTaskCount: tasks.length,
      longestTaskMs: tasks.reduce((max, task) => Math.max(max, task.duration), 0),
      blockingMs: tasks.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0),
      rowsInStore: window.stateStore.read('messages').length,
      mountedRows: document.querySelectorAll('#msgList .msg').length,
      msgListNodes: document.getElementById('msgList')?.getElementsByTagName('*').length ?? 0,
      documentNodes: document.getElementsByTagName('*').length,
    };
  }, id);
}

async function heapMb(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return usedSize / 1048576;
}

async function scrollToTop(page) {
  return page.evaluate(async () => {
    const list = document.getElementById('msgList');
    const deltas = [];
    const start = performance.now();
    let last = start;
    for (let step = 0; step < 90; step++) {
      list.scrollTop = Math.max(0, list.scrollTop - 700);
      list.dispatchEvent(new Event('scroll'));
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      deltas.push(now - last);
      last = now;
    }
    const tasks = window.__largePerf.longTasks.filter((task) => task.startTime >= start);
    const sorted = [...deltas].sort((a, b) => a - b);
    return {
      frames: deltas.length,
      jankFrames: deltas.filter((delta) => delta > 50).length,
      p95FrameMs: sorted[Math.ceil(sorted.length * 0.95) - 1],
      maxFrameMs: sorted[sorted.length - 1],
      longTaskCount: tasks.length,
      blockingMs: tasks.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0),
      mountedRows: document.querySelectorAll('#msgList .msg').length,
      rowsInStore: window.stateStore.read('messages').length,
    };
  });
}

async function streamCommits(page) {
  return page.evaluate(async () => {
    const messages = window.stateStore.read('messages');
    const index = messages.length;
    let text = 'Streaming answer. ' + 'Words keep arriving as the model writes. '.repeat(20);
    window.stateStore.dispatch({ type: 'session/append-message', payload: {
      clientId: 'large-live', role: 'assistant', type: 'streaming', rawText: text, html: '',
    } });
    window.dispatchEvent(new CustomEvent('socrates:chat-runtime-publish', { detail: { type: 'state-synced', reason: 'large-live' } }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const commits = [];
    const frames = [];
    const start = performance.now();
    for (let i = 0; i < 60; i++) {
      text += ` token-${i}`;
      const t0 = performance.now();
      window.stateStore.dispatch({ type: 'session/update-message', index, clientId: 'large-live', patch: { rawText: text } });
      window.dispatchEvent(new CustomEvent('socrates:chat-runtime-publish', {
        detail: { type: 'stream-delta', messageId: 'large-live', textLength: text.length },
      }));
      await Promise.resolve();
      await Promise.resolve();
      commits.push(performance.now() - t0);
      await new Promise(requestAnimationFrame);
      frames.push(performance.now() - t0);
    }
    const tasks = window.__largePerf.longTasks.filter((task) => task.startTime >= start);
    await new Promise((resolve) => setTimeout(resolve, 800));
    const live = document.querySelector('[data-client-id="large-live"]');
    return { commits, frames, longTaskCount: tasks.length, liveVisible: Boolean(live && live.textContent.includes('token-59')) };
  });
}

async function typeLatency(page) {
  const started = await page.evaluate(() => performance.now());
  const editor = page.locator('#composerInputWrap .tiptap');
  await editor.click();
  await editor.pressSequentially('Typing into a very long conversation.', { delay: 15 });
  return page.evaluate((since) => {
    const events = window.__largePerf.events.filter((event) => event.startTime >= since
      && /^(keydown|keypress|keyup|beforeinput|input)$/.test(event.name)).map((event) => event.duration);
    const sorted = [...events].sort((a, b) => a - b);
    return {
      inputEventsOver16ms: events.length,
      inputEventP95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : 0,
      inputEventMaxMs: sorted.length ? sorted[sorted.length - 1] : 0,
    };
  }, started);
}

test('a 2,000-message session opens from one tail page with a bounded first screen', async ({ page }, info) => {
  test.setTimeout(120_000);
  const { errors, log } = await boot(page, 2000);
  const opened = await openSession(page, SESSION_A);
  await info.attach('large-session-open', { body: JSON.stringify({ opened, log }, null, 2), contentType: 'application/json' });
  console.log(`LARGE_SESSION_OPEN ${JSON.stringify(opened)}`);

  await expect(page.locator('#msgList .msg.assistant').last()).toContainText('Result marker 1999');
  // Generous wall-clock ceiling: catches an order-of-magnitude regression
  // (a full-transcript parse) without depending on runner speed.
  expect(opened.openMs).toBeLessThan(5000);
  expect(opened.mountedRows).toBeLessThanOrEqual(60);
  if (!baseline) {
    expect(log.filter((entry) => entry.kind === 'full')).toEqual([]);
    expect(log.filter((entry) => entry.id === SESSION_A).reduce((sum, entry) => sum + entry.rows, 0)).toBeLessThanOrEqual(200);
    expect(opened.rowsInStore).toBeLessThanOrEqual(200);
    // First-screen DOM ceiling for the transcript host. 12 initial rows of
    // the heaviest fixture content measure ~1,100 nodes; the ceiling leaves
    // room for the idle fill without letting the whole history mount.
    expect(opened.msgListNodes).toBeLessThan(4000);
    expect(opened.documentNodes).toBeLessThan(7000);
  }
  expect(errors).toEqual([]);
});

test('scrolling to the top of a paginated session loads older pages, keeps the anchor, and marks the start', async ({ page }) => {
  test.skip(baseline, 'pagination behaviour is new');
  test.setTimeout(120_000);
  const { errors, log } = await boot(page, 450);
  await openSession(page, SESSION_A);
  const list = page.locator('#msgList');
  await expect(page.locator('#msgList .msg.assistant').last()).toContainText('Result marker 449');
  expect(await page.evaluate(() => window.stateStore.read('messages').length)).toBe(100);

  // Reaching the top of the loaded rows asks for the previous page; the row
  // the reader was looking at must not jump.
  let pageLoads = 0;
  await expect.poll(async () => {
    await list.evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
    pageLoads = log.filter((entry) => entry.kind === 'page').length;
    return page.evaluate(() => window.stateStore.read('messages').length);
  }, { timeout: 30_000 }).toBeGreaterThan(100);
  expect(pageLoads).toBeGreaterThan(0);

  const drift = await list.evaluate(async (el) => {
    const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await frames();
    const rows = Array.from(el.querySelectorAll('.msg[data-client-id]'));
    const hostTop = el.getBoundingClientRect().top;
    const anchor = rows.find((row) => row.getBoundingClientRect().bottom > hostTop + 1);
    if (!anchor) return null;
    const id = anchor.dataset.clientId;
    const before = anchor.getBoundingClientRect().top - hostTop;
    el.scrollTop = Math.max(0, el.scrollTop - 1);
    el.dispatchEvent(new Event('scroll'));
    await frames();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await frames();
    const after = el.querySelector(`[data-client-id="${id}"]`);
    return after ? Math.abs((after.getBoundingClientRect().top - hostTop) - before) : null;
  });
  expect(drift).not.toBeNull();
  expect(drift).toBeLessThan(40);

  // Walking all the way up ends at a visible start-of-conversation marker.
  // Each scroll to the top reveals one window shift (a dozen rows), so every
  // poll drives several shifts; one shift per poll would spend most of the
  // timeout in poll back-off rather than in the app.
  await expect.poll(async () => {
    await list.evaluate(async (el) => {
      for (let step = 0; step < 8 && !el.querySelector('[data-history-start]'); step++) {
        el.scrollTop = 0;
        el.dispatchEvent(new Event('scroll'));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
    });
    return page.locator('#msgList [data-history-start]').count();
  }, { timeout: 60_000 }).toBe(1);
  await expect(page.locator('[data-client-id="large-cccccccc-0"]')).toHaveCount(1);
  expect(await page.evaluate(() => window.stateStore.read('messages').length)).toBe(450);
  expect(await page.locator('#msgList .msg').count()).toBeLessThanOrEqual(60);
  expect(errors).toEqual([]);
});

for (const rate of [1, 4]) {
  for (const count of [1000, 2000]) {
    test(`large history report, ${count} messages, CPU x${rate}`, async ({ page }, info) => {
      test.skip(!report, 'PERF_REPORT=1 runs the measurement matrix');
      test.setTimeout(240_000);
      const { errors, log } = await boot(page, count);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      const heapBefore = await heapMb(cdp);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });

      const open = await openSession(page, SESSION_A);
      await expect(page.locator('#msgList .msg.assistant').last()).toContainText(`Result marker ${count - 1}`);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const heapAfterOpen = await heapMb(cdp);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });

      const input = await typeLatency(page);
      const stream = await streamCommits(page);
      const scroll = await scrollToTop(page);

      const switchCold = await page.evaluate(async (id) => {
        const start = performance.now();
        await window.loadSession(id);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return performance.now() - start;
      }, SESSION_B);
      const switchBack = await page.evaluate(async (id) => {
        const start = performance.now();
        await window.loadSession(id);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return performance.now() - start;
      }, SESSION_A);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const heapEnd = await heapMb(cdp);
      const domCounters = await cdp.send('Memory.getDOMCounters');

      const result = {
        count, rate,
        open: Object.fromEntries(Object.entries(open).map(([key, value]) => [key, round(value)])),
        heapMb: { before: round(heapBefore), afterOpen: round(heapAfterOpen), end: round(heapEnd) },
        domCounters,
        input: Object.fromEntries(Object.entries(input).map(([key, value]) => [key, round(value)])),
        stream: {
          commitMedianMs: round(p(stream.commits, 0.5)), commitP95Ms: round(p(stream.commits, 0.95)),
          frameMedianMs: round(p(stream.frames, 0.5)), frameP95Ms: round(p(stream.frames, 0.95)),
          longTaskCount: stream.longTaskCount, liveVisible: stream.liveVisible,
        },
        scroll: Object.fromEntries(Object.entries(scroll).map(([key, value]) => [key, round(value)])),
        switchMs: { cold: round(switchCold), cacheHit: round(switchBack) },
        requests: log.reduce((acc, entry) => { acc[entry.kind] = (acc[entry.kind] || 0) + 1; return acc; }, {}),
        requestedRows: log.reduce((sum, entry) => sum + entry.rows, 0),
      };
      console.log(`LARGE_HISTORY_REPORT ${JSON.stringify(result)}`);
      await info.attach('large-history-report', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
      expect(errors).toEqual([]);
    });
  }
}
