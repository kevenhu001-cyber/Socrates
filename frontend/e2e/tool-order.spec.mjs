// e2e/tool-order.spec.mjs — P_tool-order-strict / P_tool-order-defer.
//
// A tool row runs strictly in order and never interrupts a finished sentence:
//   1. (live) a tool_use that lands mid-sentence mounts NOTHING until the
//      sentence completes — the TurnStatus tool-running line covers the gap —
//      then mounts exactly once, behind the period;
//   2. (finalized) a persisted offset behind "原因有三：" advances to the next
//      real period: colons/semicolons never anchor a row.
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
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.__orderTurnPromise = window.askChatTurn('天气');
  });
  return page.locator('.msg.assistant').last().locator('.msg-body');
}

test('a live row waits for its sentence, then mounts once behind the period', async ({ page }) => {
  const body = await startControllableStream(page);

  /* The <think> tail buffer holds back up to 7 chars per frame, so the
     preamble goes out in two frames: what matters is that the sentence
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
  await expect(body.locator('.thinking-status-label')).toContainText('Tool running');
  /* The sentence is unfinished: no row may mount (and therefore nothing
     can jump when punctuation arrives). */
  await expect(body.locator('.tool-inline')).toHaveCount(0);

  await page.evaluate(() => window.__pushText('情况。'));
  /* The <think> tail buffer holds back ~7 chars, so the period only
     reaches rawText once further text arrives — push enough that the
     first period flushes through, then exactly one row must mount. */
  await page.evaluate(() => window.__pushText('后来出太阳了！查到了。今天很暖和。'));
  const row = body.locator('.tool-inline[data-tcid="live-search"]');
  await expect(row).toHaveCount(1);

  await page.evaluate(() => {
    window.__pushToolResult();
    window.__closeStream();
  });
  await expect(row).toHaveAttribute('data-state', 'done');

  /* Strict order: the prose holding the sentence precedes the row, and the
     post-tool prose follows it — nothing above jumped below the row. */
  const order = await body.evaluate((el) => {
    const out = [];
    for (const node of Array.from(el.children)) {
      if (node.classList.contains('tool-inline-attachments')) continue;
      if (node.classList.contains('tool-run-prose')) {
        out.push(`text:${(node.textContent || '').replace(/▍/g, '').trim()}`);
      } else if (node.classList.contains('tool-run-group')) {
        out.push(`group:${node.dataset.category}`);
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
  const rowIdx = order.findIndex((s) => s === 'row:live-search');
  expect(rowIdx).toBeGreaterThan(-1);
  expect(order.slice(0, rowIdx).join('\n')).toContain('我先来查一下北京今天的天气情况。');
  expect(order.slice(rowIdx + 1).join('\n')).toContain('出太阳');
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
              /* Fired right behind the colon — must advance to 第一。 */
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

test('a colon never anchors a row: it advances to the next real period', async ({ page }) => {
  const body = await loadColonFixture(page);
  const order = await body.evaluate((el) => {
    const out = [];
    for (const node of Array.from(el.children)) {
      if (node.classList.contains('tool-inline-attachments')) continue;
      if (node.classList.contains('tool-run-prose')) {
        out.push(`text:${(node.textContent || '').trim()}`);
      } else if (node.classList.contains('tool-run-group')) {
        out.push(`group:${node.dataset.category}`);
      } else if (node.classList.contains('tool-inline')) {
        out.push(`row:${node.dataset.tcid}`);
      } else {
        out.push(`other:${node.className}`);
      }
    }
    return out;
  });
  /* A lone call gets no aggregate header: the row sits behind 第一。,
     not behind the colon. */
  expect(order).toEqual([
    'text:原因有三：第一。',
    'row:c1',
    'text:第二。尾巴。',
  ]);
});
