// e2e/tool-status-visual.spec.mjs — tool-running status line on a narrow
// (mobile-width) viewport, zh locale.
//
// Repro for the reported "ugly tool UI": the model streams a preamble with
// NO sentence terminator, then fires tool_use. The row is deferred behind
// the unfinished sentence (P_tool-order-defer), so the ONLY visible proof
// of work is the TurnStatus tool-running line. Pins that state to one clean
// trailer (no orphaned stream cursor, daylight between prose and status),
// then completes the sentence and pins the handoff (row mounts once,
// status retires, cursor returns).
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.use({ viewport: { width: 412, height: 860 } });

const PREAMBLE = '好的，我来演示这个工作流：先把一段文本写入文件，再根据内容里的关';

test('deferred tool shows a clean single status line, no orphan dots', async ({ page }) => {
  await page.addInitScript((preamble) => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    let ref = null;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (!url.includes('/chat/stream')) return nativeFetch(input, init);
      const stream = new ReadableStream({
        start(controller) {
          ref = controller;
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta: { content: preamble } }] })}\n\n`,
          ));
        },
      });
      window.__pushToolUse = () => {
        ref.enqueue(encoder.encode(frame('tool_use', [
          { id: 'w-defer', name: 'Write', input: { file_path: 'demo.txt', content: 'hello' } },
        ])));
      };
      window.__pushText = (content) => {
        ref.enqueue(encoder.encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
        ));
      };
      return Promise.resolve(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  }, PREAMBLE);
  await mockAuthedApp(page, { lang: 'zh' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    const sessionId = '66666666-6666-4666-8666-666666666666';
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: sessionId });
    window.stateStore.dispatch({
      type: 'state/set', key: 'messages',
      value: [{ clientId: 'user-defer', role: 'user', rawText: '演示一下', html: null }],
    });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.__deferPromise = window.askChatTurn('演示一下');
  });

  const bubble = page.locator('.msg.assistant').last().locator('.msg-body');
  await expect(bubble).toContainText('先把一段文本写入文件');
  await page.evaluate(() => window.__pushToolUse());
  // The deferred state: status line visible, NO mounted tool row yet.
  await expect(bubble.locator('.tool-inline')).toHaveCount(0);
  await expect(bubble).toContainText('工具运行中');

  // No orphaned stream cursor next to the status spinner: while the live
  // status line shows, it owns the "alive" signal.
  await expect(bubble.locator('.stream-cursor')).toHaveCount(0);

  // The status trailer must not touch the prose above it.
  const gap = await bubble.evaluate((el) => {
    const status = el.querySelector('.thinking-status');
    const paras = el.querySelectorAll('.tool-run-prose p');
    if (!status || !paras.length) return -1;
    const s = status.getBoundingClientRect();
    const p = paras[paras.length - 1].getBoundingClientRect();
    return s.top - p.bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(4);

  await page.waitForTimeout(400);
  await bubble.screenshot({ path: 'test-results/tool-status-deferred.png' });

  // Completing the sentence mounts the row exactly once, retires the
  // status line, and hands the liveness signal back to the cursor.
  await page.evaluate(() => window.__pushText('容。文件已经写好，你可以看了。再见。'));
  const row = bubble.locator('.tool-inline[data-tcid="w-defer"]');
  await expect(row).toHaveCount(1);
  await expect(bubble.locator('.thinking-status')).toHaveCount(0);
  await expect(bubble.locator('.stream-cursor')).toHaveCount(1);
  await expect(row.locator('.tool-inline-label')).toContainText('demo.txt');
  await page.waitForTimeout(400);
  await bubble.screenshot({ path: 'test-results/tool-status-mounted.png' });
});
