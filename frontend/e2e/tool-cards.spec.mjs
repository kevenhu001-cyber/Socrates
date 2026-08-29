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

/* Every copy assertion below is English — the app ships with zh as its default
   language, and the labels are now derived per-tool with objects ("Searched
   \"alpha\"" rather than a bare verb), so word order matters. Pin the locale
   instead of depending on the shipped default. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('socrates-lang-app', 'en'); } catch (_) {}
  });
});

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
  /* P_declarative-tool-run — the settled row names its object and moves the
     count to meta: "Found 1 web results" said nothing about which search. */
  await expect(row.locator('.tool-inline-label')).toContainText('Searched "weather today"');
  await expect(row.locator('.tool-inline-meta')).toContainText('1 source');
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

  /* P_persist-split-points — the durable contract for "a reload re-renders all
     three rows" is data, not markup: every call records where it splits the
     answer, and the renderer rebuilds the layout from toolCalls[] + rawText.
     (It used to assert `data-tcid` inside message.html, which only pinned the
     baked-HTML implementation. Stage 2 removes that baking; the assertions
     below hold either way.) The single-card slot stays presentation-only. */
  const finalized = await page.evaluate(() => {
    const last = window.state.messages[window.state.messages.length - 1];
    const calls = Array.isArray(last && last.toolCalls) ? last.toolCalls : [];
    return { ids: calls.map((t) => t.id), offsets: calls.map((t) => t.textOffset) };
  });
  expect(finalized.ids).toEqual(['search-a', 'code-b', 'search-c']);
  for (const offset of finalized.offsets) {
    expect(typeof offset, 'each persisted call records its split point').toBe('number');
  }
  await expect(page.locator('.msg.assistant').last().locator('.tool-inline')).toHaveCount(3);
});

test('consecutive same-category tools aggregate under one collapsible header', async ({ page }) => {
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

  /* P_declarative-tool-run — a run of same-category calls collapses under one
     aggregate header (react/tool-run/ToolRunGroup). The old contract was a
     single merged `.tool-inline` row carrying data-group-count/-ids; the rows
     are now real rows inside a `.tool-run-list`, which is what expanding has
     to reveal. */
  const bubble = page.locator('.msg.assistant').last();
  await expect(bubble.locator('.tool-run-group')).toHaveCount(1);
  const group = bubble.locator('.tool-run-group').first();
  await expect(group).toHaveAttribute('data-state', 'complete');
  await expect(group).toHaveAttribute('data-category', 'search');
  await expect(group.locator('.tool-run-summary-label')).toContainText('Found 2 sources · 2 searches');
  await expect(group.locator('.tool-run-summary-meta')).toContainText('2 actions');
  /* Collapsed until asked: the member rows are in the DOM, off the screen. */
  await expect(group.locator('.tool-run-list')).toBeHidden();
  await expect(group.locator('.tool-inline')).toHaveCount(2);
  await expect(group.locator('.tool-inline').first()).toBeHidden();

  await group.locator('.tool-run-summary').click();
  await expect(group.locator('.tool-run-list')).toBeVisible();
  await expect(group.locator('.tool-inline[data-tcid="group-a"]')).toHaveCount(1);
  await expect(group.locator('.tool-inline[data-tcid="group-b"]')).toHaveCount(1);
  await expect(group.locator('.tool-inline[data-tcid="group-a"] .tool-inline-label'))
    .toHaveText('Searched "alpha"');
  /* The aggregate answers "what did I learn" in one place: the merged source
     list is the group's own detail, not a per-row dump. */
  const aggregate = group.locator('.tool-run-list > .tool-inline-detail');
  await expect(aggregate.locator('[data-kind="sources"] .tool-inline-src-title')).toHaveCount(2);
  await expect(aggregate.locator('[data-kind="sources"]')).toContainText('Beta');

  /* Same split-point contract as the burst test above: the merged row is a
     rendering decision, the persistence is one record per call. */
  const groupCalls = await page.evaluate(() => {
    const last = window.state.messages[window.state.messages.length - 1];
    const calls = Array.isArray(last && last.toolCalls) ? last.toolCalls : [];
    return { ids: calls.map((t) => t.id), offsets: calls.map((t) => t.textOffset) };
  });
  expect(groupCalls.ids).toEqual(['group-a', 'group-b']);
  expect(groupCalls.offsets.every((o) => typeof o === 'number'), 'merging must not drop a split point').toBe(true);
});

test('a failed member marks the grouped run and keeps its own error detail', async ({ page }) => {
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

  /* P_declarative-tool-run — a member that failed marks the whole aggregate
     and says so in the header meta, which is the only part of a collapsed run
     a reader sees. The failure then belongs to the row that caused it. */
  const bubble = page.locator('.msg.assistant').last();
  const group = bubble.locator('.tool-run-group').first();
  await expect(group).toHaveAttribute('data-state', 'error');
  await expect(group.locator('.tool-run-summary-meta')).toContainText('1 failed');

  await group.locator('.tool-run-summary').click();
  const failed = group.locator('.tool-inline[data-tcid="fail-b"]');
  await expect(failed).toHaveAttribute('data-state', 'error');
  await expect(failed).toHaveAttribute('data-error', '1');
  await failed.locator('summary').click();
  await expect(failed.locator('[data-kind="error"] .tool-inline-detail-value')).toContainText('boom');
  /* The row that succeeded is not painted as a failure. */
  await expect(group.locator('.tool-inline[data-tcid="fail-a"]')).toHaveAttribute('data-state', 'done');
});
