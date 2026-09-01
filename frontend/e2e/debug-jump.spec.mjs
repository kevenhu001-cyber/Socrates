import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.setTimeout(180000);

async function prepareStream(page, options = {}) {
  const delay = options.delay || 100;
  const finishDelay = options.finishDelay || 600;
  const deltas = options.deltas;
  await page.evaluate(async ({ delay, finishDelay, deltas }) => {
    const originalFetch = window.fetch.bind(window);
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
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [] });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');

    for (let i = 0; i < 10; i += 1) {
      window.addMessage(i % 2 ? 'assistant' : 'user', `Earlier message ${i}: ${'context '.repeat(20)}`);
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    window.stateStore.dispatch({ type: "state/set", key: "_userScrolledAway", value: false });

    // instrumentation: record every scroll position change
    window.__scrollLog = [];
    list.addEventListener('scroll', () => {
      window.__scrollLog.push({
        t: Math.round(performance.now()),
        top: Math.round(list.scrollTop),
        dfb: Math.round(list.scrollHeight - list.scrollTop - list.clientHeight),
        away: window.stateStore.read("_userScrolledAway"),
      });
    });
    // track flag flips
    window.__awayLog = [];
    let _away = window.stateStore.read("_userScrolledAway");
    window.stateStore.subscribe(() => {
        const v = window.stateStore.read("_userScrolledAway");
        if (v !== _away) {
          window.__awayLog.push({
            t: Math.round(performance.now()),
            v,
            top: Math.round(list.scrollTop),
            dfb: Math.round(list.scrollHeight - list.scrollTop - list.clientHeight),
            stack: new Error().stack.split('\n').slice(1, 4).join(' | '),
          });
        }
        _away = v;
    });
    // track programmatic scrollTop writes on the list
    window.__setLog = [];
    const proto = Object.getPrototypeOf(list);
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    Object.defineProperty(list, 'scrollTop', {
      get() { return desc.get.call(list); },
      set(v) {
        window.__setLog.push({
          t: Math.round(performance.now()),
          v: Math.round(v),
          sh: list.scrollHeight,
          stack: new Error().stack.split('\n').slice(1, 5).join(' | '),
        });
        desc.set.call(list, v);
      },
      configurable: true,
    });
  }, { delay, finishDelay, deltas });
}

test('instrumented: new turn anchors the question near the top after finish (think + long answer)', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const paragraphs = [];
  for (let i = 0; i < 14; i++) {
    paragraphs.push(` Paragraph ${i}: this is a long streamed answer body that keeps growing with plenty of text so the answer is taller than the viewport.\n\n`);
  }
  const deltas = [
    '<think>Let me think about this question carefully',
    ' and reason step by step about the topic.</think>',
    '# Answer\n\nHere it comes.\n\n',
    ...paragraphs,
    'Final conclusion paragraph.',
  ];
  await prepareStream(page, { deltas, delay: 60, finishDelay: 500 });

  await page.evaluate(() => {
    window.__streamPromise = window.askChatTurn('Why is the sky blue?');
  });

  // wait for stream to complete
  await page.evaluate(() => window.__streamPromise);
  // mark finish time
  const tFinish = await page.evaluate(() => performance.now());
  // let all async settle (handoff, mermaid, katex, session save...)
  await page.waitForTimeout(2500);

  const report = await page.evaluate((tFinish) => {
    const list = document.getElementById('msgList');
    const post = (window.__scrollLog || []).filter((e) => e.t >= tFinish - 50);
    // what's visible at the top of viewport now
    const lr = list.getBoundingClientRect();
    let topEl = null;
    for (const row of list.querySelectorAll('.msg')) {
      const r = row.getBoundingClientRect();
      if (r.bottom > lr.top + 1) { topEl = row.className + ' :: ' + (row.textContent || '').slice(0, 60); break; }
    }
    // scheduleActiveTurnToTop pins the newest user question near the top
    // of the scroller; measure its offset from the scroller viewport top.
    const users = list.querySelectorAll('.msg.user');
    const lastUser = users.length ? users[users.length - 1] : null;
    const userTopOffset = lastUser
      ? Math.round(lastUser.getBoundingClientRect().top - lr.top)
      : null;
    return {
      userTopOffset,
      finalDfb: Math.round(list.scrollHeight - list.scrollTop - list.clientHeight),
      finalTop: Math.round(list.scrollTop),
      scrollHeight: list.scrollHeight,
      postFinishScrolls: post.slice(-30),
      awayLog: window.__awayLog,
      setLog: (window.__setLog || []).slice(-12),
      fullScrollLog: (window.__scrollLog || []).slice(-10),
      topEl,
      userScrolledAway: window.stateStore.read("_userScrolledAway"),
    };
  }, tFinish);

  console.log(JSON.stringify(report, null, 2));
  // The reader never scrolled away, so the turn-to-top anchor must hold:
  // the newest question stays near the top of the scroller (targetOffset
  // is ~12px; allow generous slack for reserve/handoff settle) and the
  // scrolled-away flag stays clear.
  expect(report.userScrolledAway).toBeFalsy();
  expect(report.userTopOffset).not.toBeNull();
  expect(report.userTopOffset).toBeLessThanOrEqual(48);
  expect(report.userTopOffset).toBeGreaterThanOrEqual(-4);
});
