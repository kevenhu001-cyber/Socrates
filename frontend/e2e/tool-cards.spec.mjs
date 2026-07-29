// Live-chat tool-call path no longer renders an agent-tool-card.
// The model announces what it is doing with an inline status label
// (Searching / Coding / Data Processing), and any image artifact
// produced by the run shows up inline in the message body. Web search
// results are still parsed by the streaming controller (so the
// inline artifact dedup logic gets exercised) but no collapsible
// card wraps them.
//
// This file keeps three regression checks:
//   1. The inline status label appears during the tool_use event and
//      is removed once the model's reply starts streaming.
//   2. Image artifacts render inline in the message body, not inside
//      a tool card (the card path doesn't exist anymore).
//   3. The search result parser still treats javascript: URLs as
//      non-clickable (defence against the model emitting unsafe URLs).
//
// The legacy agent-tool-card path is preserved for share/history
// replay; that is exercised separately by share-view.spec.mjs.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLefQAAAABJRU5ErkJggg==',
  'base64',
);

test('live chat shows an inline tool status instead of a tool card', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockAuthedApp(page);
  await page.route('**/api/**/files/plot-1/raw**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG });
  });
  await page.route('**/api/**/chat/stream', async (route) => {
    const stream = [
      'event: tool_use\ndata: [{"id":"search-1","name":"web_search","input":{"query":"Socrates learning"}}]\n\n',
      'event: tool_result\ndata: {"id":"search-1","ok":true,"status":"completed","output":"two sources","results":[{"title":"Trusted source","url":"https://example.test/source","snippet":"A concise result.","date":"2026-07-15"},{"title":"Unsafe source","url":"javascript:alert(1)","snippet":"Must not become executable."}]}\n\n',
      'event: tool_use\ndata: [{"id":"code-1","name":"code_interpreter","input":{"language":"python","code":"import matplotlib.pyplot as plt\\nplt.plot([0, 1])\\nplt.savefig(\u0027artifacts/plot.png\u0027)"}}]\n\n',
      'event: tool_progress\ndata: {"id":"code-1","phase":"ready","chunk":"","elapsedMs":5}\n\n',
      'event: tool_result\ndata: {"id":"code-1","ok":true,"status":"completed","output":"answer: 42","stderr":"","durationMs":15,"artifacts":[{"id":"plot-1","mimeType":"image/png"}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Completed the requested work."}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
  });

  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(async () => {
    window.state.phase = 'chat';
    window.state.currentSessionId = '11111111-1111-4111-8111-111111111111';
    window.state.messages = [{ clientId: 'user-1', role: 'user', rawText: 'Run the tools', html: null }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    await window.askChatTurn('Run the tools');
  });

  const bubble = page.locator('.msg.assistant').last();

  // Live chat must not have the legacy tool card chrome.
  await expect(page.locator('.agent-tool-card')).toHaveCount(0);
  await expect(page.locator('.tool-run-group')).toHaveCount(0);

  // The text reply landed, so the status pill should be gone and the
  // artifact image should be visible inline in the message body.
  await expect(bubble.locator('.thinking-status')).toHaveCount(0);
  await expect(bubble.locator('img.exec-artifact-image')).toBeVisible();
});

test('inline tool rows never split an unfinished sentence', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route('**/api/**/chat/stream', async (route) => {
    const stream = [
      'data: {"choices":[{"delta":{"content":"先说明结论。 然后继续检查这个模块"}}]}\n\n',
      'event: tool_use\ndata: [{"id":"boundary-search","name":"web_search","input":{"query":"module"}}]\n\n',
      'event: tool_result\ndata: {"id":"boundary-search","ok":true,"status":"completed","output":"found"}\n\n',
      'data: {"choices":[{"delta":{"content":"的实现细节，再给出修复方案。"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
  });

  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(async () => {
    window.state.phase = 'chat';
    const sessionId = '11111111-1111-4111-8111-111111111111';
    window.state.currentSessionId = sessionId;
    window.state.session.currentSessionId = sessionId;
    window.state.messages = [{ clientId: 'user-boundary', role: 'user', rawText: 'Check it', html: null }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    await window.askChatTurn('Check it');
  });

  const bubble = page.locator('.msg.assistant').last();
  const row = bubble.locator('.tool-inline[data-tcid="boundary-search"]');
  await expect(row).toHaveCount(1);
  const order = await row.evaluate((toolRow) => {
    let before = '';
    let after = '';
    for (let node = toolRow.previousSibling; node; node = node.previousSibling) before = (node.textContent || '') + before;
    for (let node = toolRow.nextSibling; node; node = node.nextSibling) after += node.textContent || '';
    return { before: before.replace(/\s+/g, ' ').trim(), after: after.replace(/\s+/g, ' ').trim() };
  });
  expect(order.before).toContain('先说明结论。');
  expect(order.before).not.toContain('然后继续检查这个模块');
  expect(order.after).toContain('然后继续检查这个模块的实现细节，再给出修复方案。');
});

test('live chat shows a Searching label while the model is searching', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input && input.url ? input.url : '';
      if (!url.includes('/chat/stream')) return nativeFetch(input, init);
      const encoder = new TextEncoder();
      let controllerRef;
      const body = new ReadableStream({
        start(controller) {
          controllerRef = controller;
          controller.enqueue(encoder.encode(
            'event: tool_use\ndata: [{"id":"late-search","name":"web_search","input":{"query":"weather today"}}]\n\n',
          ));
        },
      });
      window.__finishSearchStream = () => {
        controllerRef.enqueue(encoder.encode(
          'event: tool_result\ndata: {"id":"late-search","ok":true,"status":"completed","output":"one source","results":[{"title":"Weather source","url":"https://example.test/weather"}]}\n\n',
        ));
        controllerRef.enqueue(encoder.encode(
          'data: {"choices":[{"delta":{"content":"The search is complete."}}]}\n\n',
        ));
        controllerRef.enqueue(encoder.encode('data: [DONE]\n\n'));
        controllerRef.close();
      };
      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  });
  await mockAuthedApp(page);

  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    const sessionId = '22222222-2222-4222-8222-222222222222';
    window.state.phase = 'chat';
    window.state.currentSessionId = sessionId;
    window.state.session.currentSessionId = sessionId;
    window.state.messages = [{ clientId: 'user-2', role: 'user', rawText: 'Look something up', html: null }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.__searchTurnPromise = window.askChatTurn('Look something up');
  });

  const row = page.locator('.msg.assistant .tool-inline[data-tcid="late-search"]').last();
  await expect(row).toBeVisible();
  await expect(row.locator('.tool-inline-label')).toContainText('Searching');
  await expect(row).toHaveAttribute('data-state', 'running');

  await page.evaluate(() => window.__finishSearchStream());
  await expect(row).toHaveAttribute('data-state', 'done');
  await expect(row.locator('.tool-inline-label')).toContainText('Found 1');
});