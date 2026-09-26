import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* P_stream-finish-stability — the end of a stream must not move anything the
   reader is looking at. The live turn paints settled markdown blocks one by
   one and, at finish, repaints the whole answer in one pass; the two layouts
   have to be identical. Regressions this guards:
     • paragraph gaps read 0 while streaming (each settled block's last <p>
       matched `#appShell .msg-body p:last-child`) and snapped to 10px at
       finish;
     • a standalone `$…$` line went from inline to a centred display formula;
     • the typing dot's own line box vanished at finish;
     • a long answer squeezed to its turn-anchor min-height was clipped by
       content-visibility:auto on the settled row, so the viewport jumped and
       the tail became unreachable. */

const ANSWER = [
  '## 解题思路',
  '',
  '首先，我们回顾一下二次方程的一般形式。这里给出一段较长的说明文字，用来观察段落之间的间距在输出过程中和输出完成后是否一致。',
  '',
  '第二段：判别式的符号决定了实根的个数，这一点非常关键。',
  '',
  '$\\Delta = b^2 - 4ac$',
  '',
  '第三段：根据判别式可以分成三种情况。',
  '',
  '1. 当 $\\Delta > 0$ 时，有两个不同的实根；',
  '2. 当 $\\Delta = 0$ 时，有一个二重根；',
  '3. 当 $\\Delta < 0$ 时，没有实根。',
  '',
  '> 提示：判别式来自配方法。',
  '',
  '```python',
  'def roots(a, b, c):',
  '    d = b * b - 4 * a * c',
  '    return d',
  '```',
  '',
  '| 情况 | 根的个数 |',
  '| --- | --- |',
  '| 大于零 | 2 |',
  '',
  '### 小结',
  '',
  '最后一段总结：记住判别式即可快速判断。',
].join('\n');

function chunk(text, size) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/* Streams `deltas`, then holds [DONE] for `finishDelay` ms so the fully
   painted live turn can be measured before finish() replaces it. */
async function startStream(page, deltas, { delay = 25, finishDelay = 1500 } = {}) {
  await page.evaluate(async ({ deltas, delay, finishDelay }) => {
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
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '66666666-6666-4666-8666-666666666666' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.__finishStabilityTurn = window.askChatTurn('讲讲判别式');
  }, { deltas, delay, finishDelay });
}

async function measure(page) {
  return page.evaluate(() => {
    const list = document.getElementById('msgList');
    const row = Array.from(list.querySelectorAll('.msg.assistant')).at(-1);
    const body = row.querySelector('.msg-body');
    const bodyTop = body.getBoundingClientRect().top;
    const listTop = list.getBoundingClientRect().top;
    return {
      bodyHeight: body.getBoundingClientRect().height,
      bodyOffset: bodyTop - listTop,
      scrollHeight: list.scrollHeight,
      scrollTop: list.scrollTop,
      blocks: Array.from(body.querySelectorAll('.tool-run-prose > *')).map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 16),
        top: el.getBoundingClientRect().top - bodyTop,
        height: el.getBoundingClientRect().height,
      })),
    };
  });
}

async function waitForSettledTurn(page) {
  await page.evaluate(() => window.__finishStabilityTurn);
  const bubble = page.locator('#msgList .msg.assistant').last();
  await expect(bubble).toHaveAttribute('data-stream-settled', 'true');
  await expect(bubble.locator('.stream-cursor')).toHaveCount(0);
  /* finish() re-asserts the scroll anchor for up to 30 frames. */
  await page.waitForTimeout(700);
}

async function openChat(page, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
}

/* Desktop is where settled rows get content-visibility:auto; the phone
   layout keeps rows visible but shares the prose, seam, and cursor rules. */
for (const [label, viewport] of [['desktop', null], ['mobile', { width: 390, height: 844 }]]) test(`finishing a stream does not move any block of the answer (${label})`, async ({ page }) => {
  await openChat(page, viewport);
  await startStream(page, chunk(ANSWER, 18));
  const bubble = page.locator('#msgList .msg.assistant').last();
  /* The whole answer is painted live, last characters included, while
     [DONE] is still pending. */
  await expect(bubble.locator('.tool-run-prose.is-live')).toContainText('即可快速判断。');
  await expect(bubble.locator('.tool-run-prose.is-settled .katex-display')).toHaveCount(1);
  const live = await measure(page);

  await waitForSettledTurn(page);
  const done = await measure(page);

  expect(done.blocks.map((b) => b.tag)).toEqual(live.blocks.map((b) => b.tag));
  for (let i = 0; i < live.blocks.length; i += 1) {
    const a = live.blocks[i];
    const b = done.blocks[i];
    expect(Math.abs(b.top - a.top), `block #${i} <${a.tag}> "${a.text}" moved at finish`).toBeLessThanOrEqual(1);
    expect(Math.abs(b.height - a.height), `block #${i} <${a.tag}> "${a.text}" resized at finish`).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(done.bodyHeight - live.bodyHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(done.bodyOffset - live.bodyOffset), 'the answer moved in the viewport').toBeLessThanOrEqual(2);
  expect(Math.abs(done.scrollHeight - live.scrollHeight)).toBeLessThanOrEqual(2);
});

test('a long answer stays fully reachable after finish', async ({ page }) => {
  await openChat(page, null);
  const long = [ANSWER, ANSWER, ANSWER].join('\n\n');
  await startStream(page, chunk(long, 60), { delay: 15, finishDelay: 200 });
  await waitForSettledTurn(page);

  const res = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
    const row = Array.from(list.querySelectorAll('.msg.assistant')).at(-1);
    const body = row.querySelector('.msg-body');
    const lastP = Array.from(body.querySelectorAll('.tool-run-prose > p')).at(-1);
    const listRect = list.getBoundingClientRect();
    const pRect = lastP.getBoundingClientRect();
    const probeY = Math.min(pRect.top + pRect.height / 2, listRect.bottom - 2);
    const hit = document.elementFromPoint(pRect.left + 10, probeY);
    return {
      rowHeight: row.getBoundingClientRect().height,
      bodyHeight: body.getBoundingClientRect().height,
      lastPBottom: pRect.bottom,
      listBottom: listRect.bottom,
      lastPHit: Boolean(hit && lastP.contains(hit)),
    };
  });
  expect(res.rowHeight, 'the row must not be squeezed below its content').toBeGreaterThanOrEqual(res.bodyHeight);
  expect(res.lastPBottom).toBeLessThanOrEqual(res.listBottom + 1);
  expect(res.lastPHit, 'the last paragraph is painted and not covered after scrolling to the end').toBe(true);
});
