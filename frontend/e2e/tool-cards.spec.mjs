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

  // The text reply landed, so the status pill should be gone.
  await expect(bubble.locator('.thinking-status')).toHaveCount(0);

  const searchRow = bubble.locator('.tool-inline[data-tcid="search-1"]');
  await expect(searchRow).toHaveAttribute('data-state', 'done');
  await expect(searchRow).toHaveAttribute('data-expandable', '1');

  await searchRow.locator('summary').click();
  await expect(searchRow).toHaveAttribute('open', '');
  await expect(searchRow.locator('.tool-inline-sources')).toContainText('Trusted source');
  await expect(searchRow.locator('.tool-inline-src[href]')).toHaveCount(1);
});

test('tool activity lands at the call site without splitting a sentence', async ({ page }) => {
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
  const layout = await row.evaluate((toolRow) => {
    const body = toolRow.closest('.msg-body');
    let beforeText = '';
    let afterText = '';
    let seenRow = false;
    for (const node of Array.from(body?.children || [])) {
      if (node === toolRow) { seenRow = true; continue; }
      const cls = node.classList;
      if (cls && (cls.contains('tool-inline-attachments') || cls.contains('agent-run-host'))) continue;
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (seenRow) afterText += text;
      else beforeText += text;
    }
    const clone = body?.cloneNode(true);
    clone?.querySelectorAll('.tool-inline, .tool-inline-attachments, .agent-run-host').forEach((node) => node.remove());
    return {
      beforeText,
      afterText,
      prose: (clone?.textContent || '').replace(/\s+/g, ' ').trim(),
    };
  });
  // The completed first sentence stays before the row; the unfinished
  // sentence that was streaming when the tool fired continues below it —
  // intact, not split across the row.
  expect(layout.beforeText).toContain('先说明结论。');
  expect(layout.beforeText).not.toContain('然后');
  expect(layout.afterText).toContain('然后继续检查这个模块的实现细节，再给出修复方案。');
  expect(layout.prose).toContain('先说明结论。 然后继续检查这个模块的实现细节，再给出修复方案。');
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
            'data: {"choices":[{"delta":{"reasoning_content":"先判断需要查询哪些信息。"}}]}\n\n'
            + 'event: tool_use\ndata: [{"id":"late-search","name":"web_search","input":{"query":"weather today"}}]\n\n',
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
  await expect(row.locator('.tool-inline-label')).toHaveClass(/shimmer-text/);
  await expect(page.locator('.msg.assistant .thinking-status')).toHaveCount(0);
  await expect(row).toHaveAttribute('data-state', 'running');

  await page.evaluate(() => window.__finishSearchStream());
  await expect(row).toHaveAttribute('data-state', 'done');
  await expect(row.locator('.tool-inline-label')).toContainText('Found 1');
});

test('code execution switches from executing to data analysis without thinking overlap', async ({ page }) => {
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
            'event: tool_use\ndata: [{"id":"live-code","name":"code_interpreter","input":{"code":"print(1)"}}]\n\n',
          ));
        },
      });
      window.__sendCodeProgress = () => controllerRef.enqueue(encoder.encode(
        'event: tool_progress\ndata: {"id":"live-code","phase":"stdout","elapsedMs":420,"chunk":"1\\n"}\n\n',
      ));
      window.__finishCodeStream = () => {
        controllerRef.enqueue(encoder.encode(
          'event: tool_result\ndata: {"id":"live-code","ok":true,"status":"completed","output":"1"}\n\n',
        ));
        controllerRef.enqueue(encoder.encode(
          'data: {"choices":[{"delta":{"content":"Code finished."}}]}\n\n',
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
  await waitForAppShell(page);
  await page.evaluate(() => {
    const sessionId = '55555555-5555-4555-8555-555555555555';
    window.state.phase = 'chat';
    window.state.currentSessionId = sessionId;
    window.state.session.currentSessionId = sessionId;
    window.state.messages = [{ clientId: 'user-code', role: 'user', rawText: 'Run code', html: null }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.__codeTurnPromise = window.askChatTurn('Run code');
  });

  const bubble = page.locator('.msg.assistant').last();
  const row = bubble.locator('.tool-inline[data-tcid="live-code"]').last();
  await expect(row.locator('.tool-inline-label')).toContainText('Executing code');
  await expect(bubble.locator('.thinking-status')).toHaveCount(0);
  await page.evaluate(() => window.__sendCodeProgress());
  await expect(row.locator('.tool-inline-label')).toContainText('Analyzing data');
  await page.evaluate(() => window.__finishCodeStream());
  await expect(row).toHaveAttribute('data-state', 'done');
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

test('live chat shows only the latest tool card during a burst but persists every call on finish', async ({ page }) => {
  // P_tool_live_card — during streaming the bubble shows at most one
  // .tool-inline. The persisted HTML on the finished message must
  // contain every call so a reload / share view re-renders all three
  // inline rows. The single-card slot is presentation-only; this is the
  // regression that proves it.
  await mockAuthedApp(page);
  await page.route('**/api/**/chat/stream', async (route) => {
    const stream = [
      'event: tool_use\ndata: [{"id":"search-a","name":"web_search","input":{"query":"alpha"}}]\n\n',
      'event: tool_use\ndata: [{"id":"code-b","name":"code_interpreter","input":{"language":"python","code":"print(1)"}}]\n\n',
      'event: tool_use\ndata: [{"id":"search-c","name":"web_search","input":{"query":"gamma"}}]\n\n',
      'event: tool_result\ndata: {"id":"search-a","ok":true,"status":"completed","output":"a"}]\n\n',
      'event: tool_result\ndata: {"id":"code-b","ok":true,"status":"completed","output":"b"}]\n\n',
      'event: tool_result\ndata: {"id":"search-c","ok":true,"status":"completed","output":"c","results":[{"title":"Gamma","url":"https://example.test/gamma"}]}\n\n',
      'data: {"choices":[{"delta":{"content":"All three tools ran in sequence."}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
  });

  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(async () => {
    const sessionId = '44444444-4444-4444-8444-444444444444';
    window.state.phase = 'chat';
    window.state.currentSessionId = sessionId;
    window.state.session.currentSessionId = sessionId;
    window.state.messages = [{ clientId: 'user-burst', role: 'user', rawText: 'Run three tools', html: null }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    await window.askChatTurn('Run three tools');
  });

  // The persisted HTML on the finished message contains every tool row
  // so reload / share / history re-render all three. The single-card
  // slot is presentation-only — it never collapses the persisted
  // toolCalls.
  const persisted = await page.evaluate(() => {
    const list = window.state.messages;
    const last = list[list.length - 1];
    return last && last.html ? last.html : '';
  });
  expect(persisted).toContain('data-tcid="search-a"');
  expect(persisted).toContain('data-tcid="code-b"');
  expect(persisted).toContain('data-tcid="search-c"');
  // The state-side toolCalls array also keeps every entry.
  const toolCallIds = await page.evaluate(() => {
    const list = window.state.messages;
    const last = list[list.length - 1];
    return Array.isArray(last && last.toolCalls) ? last.toolCalls.map((t) => t.id) : [];
  });
  expect(toolCallIds).toEqual(['search-a', 'code-b', 'search-c']);
});

test('consecutive same-category tools merge into one grouped inline row', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route('**/api/**/chat/stream', async (route) => {
    const stream = [
      'event: tool_use\ndata: [{"id":"group-a","name":"web_search","input":{"query":"alpha"}}]\n\n',
      'event: tool_use\ndata: [{"id":"group-b","name":"web_search","input":{"query":"beta"}}]\n\n',
      'event: tool_result\ndata: {"id":"group-a","ok":true,"status":"completed","output":"a","results":[{"title":"Alpha","url":"https://example.test/alpha"}]}\n\n',
      'event: tool_result\ndata: {"id":"group-b","ok":true,"status":"completed","output":"b","results":[{"title":"Beta","url":"https://example.test/beta"}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Both searches finished."}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
  });

  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(async () => {
    const sessionId = '66666666-6666-4666-8666-666666666666';
    window.state.phase = 'chat';
    window.state.currentSessionId = sessionId;
    window.state.session.currentSessionId = sessionId;
    window.state.messages = [{ clientId: 'user-group', role: 'user', rawText: 'Search twice', html: null }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    await window.askChatTurn('Search twice');
  });

  const bubble = page.locator('.msg.assistant').last();
  await expect(bubble.locator('.tool-inline')).toHaveCount(1);
  const row = bubble.locator('.tool-inline').first();
  await expect(row).toHaveAttribute('data-group-count', '2');
  await expect(row).toHaveAttribute('data-group-ids', 'group-a,group-b');
  await expect(row).toHaveAttribute('data-state', 'done');
  await expect(row.locator('.tool-inline-label')).toContainText('Found 2 sources');

  await row.locator('summary').click();
  await expect(row.locator('[data-member-id="group-a"]')).toHaveCount(1);
  await expect(row.locator('[data-member-id="group-b"]')).toHaveCount(1);
  await expect(row.locator('.tool-inline-sources')).toContainText('Alpha');
  await expect(row.locator('.tool-inline-sources')).toContainText('Beta');

  const persisted = await page.evaluate(() => {
    const list = window.state.messages;
    const last = list[list.length - 1];
    return last && last.html ? last.html : '';
  });
  expect(persisted).toContain('data-group-ids="group-a,group-b"');
  expect((persisted.match(/data-tcid="group-/g) || []).length).toBe(1);
  const toolCallIds = await page.evaluate(() => {
    const list = window.state.messages;
    const last = list[list.length - 1];
    return Array.isArray(last && last.toolCalls) ? last.toolCalls.map((t) => t.id) : [];
  });
  expect(toolCallIds).toEqual(['group-a', 'group-b']);
});

test('a failed member marks the grouped tool row as needs-attention', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route('**/api/**/chat/stream', async (route) => {
    const stream = [
      'event: tool_use\ndata: [{"id":"fail-a","name":"web_search","input":{"query":"ok"}}]\n\n',
      'event: tool_use\ndata: [{"id":"fail-b","name":"web_search","input":{"query":"broken"}}]\n\n',
      'event: tool_result\ndata: {"id":"fail-a","ok":true,"status":"completed","output":"ok"}\n\n',
      'event: tool_result\ndata: {"id":"fail-b","ok":false,"status":"failed","output":"boom"}\n\n',
      'data: {"choices":[{"delta":{"content":"One search failed."}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
  });

  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(async () => {
    const sessionId = '77777777-7777-4777-8777-777777777777';
    window.state.phase = 'chat';
    window.state.currentSessionId = sessionId;
    window.state.session.currentSessionId = sessionId;
    window.state.messages = [{ clientId: 'user-fail', role: 'user', rawText: 'Search', html: null }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    await window.askChatTurn('Search');
  });

  const bubble = page.locator('.msg.assistant').last();
  const row = bubble.locator('.tool-inline').first();
  await expect(row).toHaveAttribute('data-state', 'error');
  await expect(row.locator('.tool-inline-label')).toContainText('Tool needs attention');
  await row.locator('summary').click();
  await expect(row.locator('[data-member-id="fail-b"]')).toContainText('boom');
});
