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
      'event: tool_use\ndata: [{"id":"notion-error","name":"notion_search_pages","input":{"query":"missing page"}}]\n\n',
      'event: tool_result\ndata: {"id":"notion-error","ok":false,"status":"failed","output":"","error":"not_connected","userMessage":"Notion is not connected.","detail":"Connect Notion in the Plugins panel."}\n\n',
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

  const searchRow = bubble.locator('.tool-inline[data-tcid="search-1"]');
  const codeRow = bubble.locator('.tool-inline[data-tcid="code-1"]');
  const errorRow = bubble.locator('.tool-inline[data-tcid="notion-error"]');
  await expect(searchRow).toHaveAttribute('data-expandable', '1');
  await expect(codeRow).toHaveAttribute('data-expandable', '1');
  await expect(errorRow).toHaveAttribute('data-expandable', '1');

  await searchRow.locator('summary').click();
  await expect(searchRow).toHaveAttribute('open', '');
  await expect(searchRow.locator('.tool-inline-sources')).toContainText('Trusted source');
  await expect(searchRow.locator('.tool-inline-src[href]')).toHaveCount(1);

  await codeRow.locator('summary').click();
  await expect(codeRow).toHaveAttribute('open', '');
  await expect(codeRow.locator('[data-kind="input"]')).toContainText('matplotlib');
  await expect(codeRow.locator('[data-kind="output"]')).toContainText('answer: 42');

  await errorRow.locator('summary').click();
  await expect(errorRow).toHaveAttribute('open', '');
  await expect(errorRow.locator('[data-kind="error"]')).toContainText('Notion is not connected');
  await expect(errorRow.locator('[data-kind="technical"]')).toContainText('Connect Notion');
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

test('Tutor streams the same native tools and sends the tutor mode contract', async ({ page }) => {
  await mockAuthedApp(page);
  let requestMode = null;
  await page.route('**/api/**/chat/stream', async (route) => {
    requestMode = route.request().postDataJSON()?.mode ?? null;
    const stream = [
      'event: tool_use\ndata: [{"id":"tutor-search","name":"web_search","input":{"query":"primary source"}}]\n\n',
      'event: tool_result\ndata: {"id":"tutor-search","ok":true,"status":"completed","output":"one source","results":[{"title":"Primary source","url":"https://example.test/primary"}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Let us connect that evidence to the concept."}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(async () => {
    const sessionId = '33333333-3333-4333-8333-333333333333';
    window.setAppMode?.('tutor');
    window.state.phase = 'chat';
    window.state.topic = 'Tutor tools';
    window.state.domain = 'Tutor tools';
    window.state.currentSessionId = sessionId;
    window.state.session.currentSessionId = sessionId;
    window.state.currentNode = 0;
    window.state.kbNodes = [{ name: 'Evidence', status: 'blank', questions: 0 }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    await window.askNextQuestion();
  });

  expect(requestMode).toBe('tutor');
  const row = page.locator('.msg.assistant .tool-inline[data-tcid="tutor-search"]').last();
  await expect(row).toHaveAttribute('data-state', 'done');
  await row.locator('summary').click();
  await expect(row.locator('.tool-inline-sources')).toContainText('Primary source');
});
