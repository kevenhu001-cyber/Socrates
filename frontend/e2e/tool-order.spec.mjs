// e2e/tool-order.spec.mjs — paragraph deferral and unified activity placement.
//
// Tool rows belong to the activity surface, not between answer paragraphs:
//   1. (live) a tool_use that lands mid-paragraph mounts NOTHING until the
//      paragraph completes — the TurnStatus tool-running line covers the
//      gap — then mounts exactly once in the activity surface (a finished
//      sentence alone is not enough);
//   2. (restored) a colon offset still splits prose at the next complete
//      sentence, but the row stays in activity before both prose segments.
import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* ── live deferral ─────────────────────────────────────────────────── */

async function startControllableStream(page) {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const textFrame = (content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
    let push = null;
    let ref = null;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (!url.includes('/chat/stream')) return nativeFetch(input, init);
      const stream = new ReadableStream({
        start(controller) {
          ref = controller;
          push = (text) => controller.enqueue(encoder.encode(text));
        },
      });
      window.__pushText = (content) => push(textFrame(content));
      window.__pushToolUse = () => push(frame('tool_use', [
        { id: 'live-search', name: 'web_search', input: { query: '北京天气' } },
      ]));
      window.__pushToolResult = () => push(frame('tool_result', {
        id: 'live-search', ok: true, status: 'completed', output: 'Beijing: sunny, 22C',
      }));
      window.__closeStream = () => {
        push('data: [DONE]\n\n');
        ref.close();
      };
      return Promise.resolve(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  });
  await mockAuthedApp(page);
  await page.addInitScript(() => {
    try { localStorage.setItem('socrates-lang-app', 'en'); } catch (_) {}
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    const sessionId = '77777777-7777-4777-8777-777777777777';
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: sessionId });
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [{ clientId: 'user-order', role: 'user', rawText: '天气', html: null }] });
    window.__testActivateMainView('chatView');
    window.__orderTurnPromise = window.askChatTurn('天气');
  });
  await page.waitForFunction(() => (
    typeof window.__pushText === 'function'
    && typeof window.__pushToolUse === 'function'
    && typeof window.__pushToolResult === 'function'
    && typeof window.__closeStream === 'function'
  ), null, { timeout: 15_000 });
  return page.locator('.msg.assistant').last().locator('.msg-body');
}

test('a live row waits for its paragraph, then mounts once in activity before the prose', async ({ page }) => {
  const body = await startControllableStream(page);

  /* The <think> tail buffer holds back up to 7 chars per frame, so the
     preamble goes out in two frames: what matters is that the paragraph
     is still unfinished when tool_use lands. */
  await page.evaluate(() => {
    window.__pushText('我先来查一下北京今天');
    window.__pushText('的天气');
  });
  await expect(body.locator('.tool-run-prose')).toContainText('我先来查');

  await page.evaluate(() => window.__pushToolUse());
  /* The status line proves the tool_use was processed and rendered — only
     then is "no row" a meaningful assertion (otherwise we might just be
     faster than the render pass). */
  await expect(body.locator('.thinking-status-label')).toContainText('Searching the web…');
  /* The paragraph is unfinished: no row may mount (and therefore nothing
     can jump when punctuation arrives). A finished sentence alone must
     NOT mount it either — only a completed paragraph does. */
  await expect(body.locator('.tool-inline')).toHaveCount(0);
  await page.evaluate(() => window.__pushText('情况。后来出太阳了'));
  await expect(body.locator('.tool-inline')).toHaveCount(0);

  /* Complete the paragraph: the <think> tail buffer holds back ~7 chars,
     so push enough that the blank line flushes through, then exactly one
     row must mount in the unified activity surface. */
  await page.evaluate(() => window.__pushText('！查到了。今天很暖和。\n\n第二段讲讲结果。'));
  const row = body.locator('.tool-inline[data-tcid="live-search"]');
  await expect(row).toHaveCount(1);

  await page.evaluate(() => {
    window.__pushToolResult();
    window.__closeStream();
  });
  await expect(row).toHaveAttribute('data-state', 'done');
  await expect(body.locator('.stream-cursor')).toHaveCount(0);

  /* Strict order: one activity row precedes both prose segments; no tool
     row is inserted between the original paragraph and the answer tail. */
  const order = await body.evaluate((el) => {
    const out = [];
    for (const node of Array.from(el.querySelector('.turn-evidence').children)) {
      if (node.classList.contains('tool-inline-attachments')) continue;
      if (node.classList.contains('tool-run-prose')) {
        out.push(`text:${(node.textContent || '').replace(/▍/g, '').trim()}`);
      } else if (node.classList.contains('turn-activity-surface')) {
        for (const row of node.querySelectorAll('.tool-inline')) out.push(`row:${row.dataset.tcid}`);
      } else if (node.classList.contains('tool-run-group')) {
        for (const row of node.querySelectorAll(':scope > .tool-inline')) out.push(`row:${row.dataset.tcid}`);
      } else if (node.classList.contains('tool-inline')) {
        out.push(`row:${node.dataset.tcid}`);
      } else if (!node.classList.contains('tool-run-turn-status')
        && !node.classList.contains('thinking-status')
        && !(node.textContent || '').includes('Tool running')) {
        out.push(`other:${node.className}`);
      }
    }
    return out;
  });
  expect(order).toEqual([
    'row:live-search',
    'text:我先来查一下北京今天的天气情况。后来出太阳了！查到了。今天很暖和。',
    'text:', // The paragraph-separating whitespace retains its prose segment.
    'text:第二段讲讲结果。',
  ]);
});

/* ── finalized colon order ─────────────────────────────────────────── */

const COLON_SESSION_ID = '99999999-9999-4999-8999-999999999999';
const COLON_RAW = '原因有三：第一。第二。尾巴。';

async function loadColonFixture(page) {
  await mockAuthedApp(page);
  await page.addInitScript(() => {
    try { localStorage.setItem('socrates-lang-app', 'en'); } catch (_) {}
  });
  await page.route(new RegExp('/api/(?:v2/)?sessions/' + COLON_SESSION_ID + '(?:\\?.*)?$'), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: COLON_SESSION_ID,
        topic: 'Tool order',
        title: 'Tool order',
        domain: 'ml',
        mode: 'chat',
        kind: 'chat',
        phase: 'chat',
        messages: [
          { id: 'o-user', role: 'user', rawText: 'why', html: '<p>why</p>' },
          {
            id: 'o-assistant',
            role: 'assistant',
            rawText: COLON_RAW,
            html: `<p>${COLON_RAW}</p>`,
            toolCalls: [{
              id: 'c1',
              name: 'web_search',
              input: { query: 'why' },
              output: '1 result',
              durationMs: 100,
              status: 'completed',
              /* Fired right behind the colon — must advance to 第一。, not EOF. */
              textOffset: '原因有三：'.length,
            }],
          },
        ],
        kbNodes: [],
        mistakes: [],
      }),
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.waitForFunction(() => typeof window.loadSession === 'function', null, { timeout: 15_000 });
  await page.evaluate((id) => window.loadSession(id), COLON_SESSION_ID);
  return page.locator('#msgList .msg.assistant').last().locator('.msg-body');
}

test('a restored colon-offset row stays in activity while prose splits at the next sentence', async ({ page }) => {
  const body = await loadColonFixture(page);
  await expect(body.locator('.turn-activity-surface .tool-inline[data-tcid="c1"]')).toHaveCount(1);
  const order = await body.evaluate((el) => {
    const out = [];
    for (const node of Array.from(el.querySelector('.turn-evidence').children)) {
      if (node.classList.contains('tool-inline-attachments')) continue;
      if (node.classList.contains('tool-run-prose')) {
        out.push(`text:${(node.textContent || '').trim()}`);
      } else if (node.classList.contains('turn-activity-surface')) {
        for (const row of node.querySelectorAll('.tool-inline')) out.push(`row:${row.dataset.tcid}`);
      } else if (node.classList.contains('tool-run-group')) {
        for (const row of node.querySelectorAll(':scope > .tool-inline')) out.push(`row:${row.dataset.tcid}`);
      } else if (node.classList.contains('tool-inline')) {
        out.push(`row:${node.dataset.tcid}`);
      } else {
        out.push(`other:${node.className}`);
      }
    }
    return out;
  });
  /* The row belongs to activity; the sentence-safe prose split remains
     intact without inserting a tool between the two text segments. */
  expect(order).toEqual([
    'row:c1',
    'text:原因有三：第一。',
    'text:第二。尾巴。',
  ]);
});
