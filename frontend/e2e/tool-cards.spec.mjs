// Live-chat tool-call path no longer renders an agent-tool-card.
// RN-2: each call is one row in the turn's activity timeline (verb · object ·
// status word · time); tool-specific SVGs identify the operation and the
// row opens its detail as a drawer / sheet. Generated images stay hidden unless the assistant
// explicitly cites one in its markdown response.
//
// This file keeps three regression checks:
//   1. The row's status word is live during the tool_use event and
//      settles once the result lands.
//   2. Running search and code rows show their specific SVG glyphs.
//   3. The search result parser still treats javascript: URLs as
//      non-clickable (defence against the model emitting unsafe URLs).
//
// The legacy agent-tool-card path is preserved for share/history
// replay; that is exercised separately by share-view.spec.mjs.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { TURN, openActivity, openToolDetail, openToolGroups, toolRow, toolRowButton } from './_turn-ui.mjs';

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
      'event: tool_result\ndata: {"id":"search-1","ok":true,"status":"completed","output":"two sources","results":[{"title":"Trusted source","url":"https://example.test/source","snippet":"A concise result.","date":"2026-07-15","source":"bing"},{"title":"Unsafe source","url":"javascript:alert(1)","snippet":"Must not become executable."}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Completed the requested work."}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
  });

  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(async () => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: '11111111-1111-4111-8111-111111111111' });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'user-1', role: 'user', rawText: 'Run the tools', html: null }] });
    window.__testActivateMainView('chatView');
    await window.askChatTurn('Run the tools');
  });

  const bubble = page.locator('.msg.assistant').last();
  await openActivity(bubble);

  // Live chat must not have the legacy tool card chrome.
  await expect(page.locator('.agent-tool-card')).toHaveCount(0);

  // The text reply landed, so the live caption is gone.
  await expect(bubble.locator(TURN.progress)).toHaveCount(0);

  const searchRow = toolRow(bubble, 'search-1');
  await expect(searchRow).toHaveAttribute('data-state', 'done');
  await expect(toolRowButton(bubble, 'search-1')).toHaveAttribute('aria-haspopup', 'dialog');

  const detail = await openToolDetail(page, bubble, 'search-1');
  await expect(detail.locator(TURN.source).first()).toContainText('Trusted source');
  /* Only the http(s) source becomes a link; javascript: never does. */
  const links = detail.locator(`${TURN.source}[role="link"]`);
  await expect(links).toHaveCount(1);
  await expect(links).toContainText('Trusted source');
  await expect(links).toContainText('example.test');
});

test('live Python image artifacts stay hidden until cited in assistant markdown', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route('**/api/**/files/plot-1/raw**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG });
  });
  await page.route('**/api/**/chat/stream', async (route) => {
    const stream = [
      'event: tool_use\ndata: [{"id":"code-plot","name":"code_interpreter","input":{"language":"python","code":"plt.plot([1,2],[3,4])"}}]\n\n',
      'event: tool_result\ndata: {"id":"code-plot","name":"code_interpreter","ok":true,"status":"completed","output":"saved plot.png","artifacts":[{"id":"plot-1","mimeType":"image/png","name":"plot.png"}]}\n\n',
      'data: {"choices":[{"delta":{"content":"The plot is ready."}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(async () => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '88888888-8888-4888-8888-888888888888' });
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [{ clientId: 'user-image', role: 'user', rawText: 'Make a plot', html: null }] });
    window.__testActivateMainView('chatView');
    await window.askChatTurn('Make a plot');
  });

  const bubble = page.locator('.msg.assistant').last();
  await openActivity(bubble);
  await expect(toolRow(bubble, 'code-plot')).toHaveAttribute('data-state', 'done');
  await expect(bubble.locator('.exec-artifact, .exec-artifact-image')).toHaveCount(0);
});

test('tool activity lands behind its paragraph without splitting it', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route('**/api/**/chat/stream', async (route) => {
    const stream = [
      'data: {"choices":[{"delta":{"content":"先说明结论。\\n\\n然后继续检查这个模块"}}]}\n\n',
      'event: tool_use\ndata: [{"id":"boundary-search","name":"web_search","input":{"query":"module"}}]\n\n',
      'event: tool_result\ndata: {"id":"boundary-search","ok":true,"status":"completed","output":"found"}\n\n',
      'data: {"choices":[{"delta":{"content":"的实现细节。\\n\\n再给出修复方案。"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
  });

  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(async () => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    const sessionId = '11111111-1111-4111-8111-111111111111';
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'user-boundary', role: 'user', rawText: 'Check it', html: null }] });
    window.__testActivateMainView('chatView');
    await window.askChatTurn('Check it');
  });

  const bubble = page.locator('.msg.assistant').last();
  await openActivity(bubble);
  const row = toolRow(bubble, 'boundary-search');
  await expect(row).toHaveCount(1);
  await expect(bubble.locator(`${TURN.body} [data-tcid="boundary-search"]`)).toHaveCount(1);
  const prose = await bubble.locator('.tool-run-prose').allTextContents();
  expect(prose.join(' ').replace(/\s+/g, ' ')).toContain('先说明结论。 然后继续检查这个模块的实现细节。 再给出修复方案。');
});

test('live chat shows a running search row while the model is searching', async ({ page }) => {
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
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'user-2', role: 'user', rawText: 'Look something up', html: null }] });
    window.__testActivateMainView('chatView');
    window.__searchTurnPromise = window.askChatTurn('Look something up');
  });

  const bubble = page.locator('.msg.assistant').last();
  await openActivity(bubble);
  const row = toolRow(bubble, 'late-search');
  await expect(row).toBeVisible();
  /* Verb and object are steady text; only the status word is live. */
  await expect(row.locator(TURN.verb)).toHaveText('Search the web');
  await expect(row.locator(TURN.target)).toHaveText('weather today');
  await expect(row.locator(TURN.verb)).not.toHaveClass(/shimmer-text/);
  expect(await row.locator(TURN.verb).evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
  await expect(row.locator(TURN.status)).toHaveText('Running');
  await expect(row.locator('.tool-inline-tool-icon svg circle')).toHaveCount(1);
  await expect(row.locator('.tool-inline-tool-icon svg path')).toHaveCount(1);
  await expect(bubble.locator(TURN.progress)).toHaveCount(1);
  await expect(row).toHaveAttribute('data-state', 'running');

  await page.evaluate(() => window.__finishSearchStream());
  await expect(row).toHaveAttribute('data-state', 'done');
  /* P_declarative-tool-run — the settled row still names its object; the
     source count moves into the drawer's subtitle. */
  await expect(row.locator(TURN.status)).toHaveText('Done');
  await expect(row.locator(TURN.target)).toHaveText('weather today');
  const detail = await openToolDetail(page, bubble, 'late-search');
  await expect(detail).toContainText('1 source');
});

test('code execution streams live output into its row without thinking overlap', async ({ page }) => {
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
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'user-code', role: 'user', rawText: 'Run code', html: null }] });
    window.__testActivateMainView('chatView');
    window.__codeTurnPromise = window.askChatTurn('Run code');
  });

  const bubble = page.locator('.msg.assistant').last();
  await openActivity(bubble);
  const row = toolRow(bubble, 'live-code');
  await expect(row.locator(TURN.verb)).toHaveText('Run code');
  await expect(row.locator(TURN.status)).toHaveText('Running');
  await expect(row.locator('.tool-inline-tool-icon svg')).toBeVisible();
  /* The icon set is a single-path glyph now; what the gate owns is that the
     inline tool icon actually paints, not how many paths it is cut into. */
  expect(await row.locator('.tool-inline-tool-icon svg path').count()).toBeGreaterThan(0);
  await expect(bubble.locator(TURN.surface)).toHaveCount(1);
  /* RN-2 dropped the phase relabel (Executing code → Analyzing data): the
     verb stays put and the stdout chunk shows up as live output instead. */
  await page.evaluate(() => window.__sendCodeProgress());
  const detail = await openToolDetail(page, bubble, 'live-code');
  await expect(detail.locator('[data-testid="tool-detail-section-live"]')).toContainText('1');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__finishCodeStream());
  await expect(row).toHaveAttribute('data-state', 'done');
  await expect(row.locator(TURN.status)).toHaveText('Done');
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
  await page.locator('#topModeTutor').click();
  await page.evaluate(async () => {
    const sessionId = '33333333-3333-4333-8333-333333333333';
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "topic", value: 'Tutor tools' });
    window.stateStore.dispatch({ type: "state/set", key: "domain", value: 'Tutor tools' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "currentNode", value: 0 });
    window.stateStore.dispatch({ type: "state/set", key: "kbNodes", value: [{ name: 'Evidence', status: 'blank', questions: 0 }] });
    window.__testActivateMainView('chatView');
    await window.askNextQuestion();
  });

  expect(requestMode).toBe('tutor');
  const bubble = page.locator('.msg.assistant').last();
  await openActivity(bubble);
  const row = toolRow(bubble, 'tutor-search');
  await expect(row).toHaveAttribute('data-state', 'done');
  const detail = await openToolDetail(page, bubble, 'tutor-search');
  await expect(detail.locator(TURN.sources)).toContainText('Primary source');
});

test('live chat keeps a burst in the reading flow and persists every call on finish', async ({ page }) => {
  // P_tool_live_card — the persisted HTML on the finished message must
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
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'user-burst', role: 'user', rawText: 'Run three tools', html: null }] });
    window.__testActivateMainView('chatView');
    await window.askChatTurn('Run three tools');
  });

  /* P_persist-split-points — the durable contract for "a reload re-renders all
     three rows" is data, not markup: every call records where it splits the
     answer, and the renderer rebuilds the layout from toolCalls[] + rawText.
     (It used to assert `data-tcid` inside message.html, which only pinned the
     baked-HTML implementation. Stage 2 removes that baking; the assertions
     below hold either way.) The single-card slot stays presentation-only. */
  const finalized = await page.evaluate(() => {
    const last = window.stateStore.read("messages")[window.stateStore.read("messages").length - 1];
    const calls = Array.isArray(last && last.toolCalls) ? last.toolCalls : [];
    return { ids: calls.map((t) => t.id), offsets: calls.map((t) => t.textOffset) };
  });
  expect(finalized.ids).toEqual(['search-a', 'code-b', 'search-c']);
  for (const offset of finalized.offsets) {
    expect(typeof offset, 'each persisted call records its split point').toBe('number');
  }
  const burst = page.locator('.msg.assistant').last();
  await openActivity(burst);
  await openToolGroups(burst);
  await expect(burst.locator(TURN.row)).toHaveCount(3);
});

test('consecutive tools merge into one group whose rows stay individually inspectable', async ({ page }) => {
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
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'user-group', role: 'user', rawText: 'Search twice', html: null }] });
    window.__testActivateMainView('chatView');
    await window.askChatTurn('Search twice');
  });

  const bubble = page.locator('.msg.assistant').last();
  await openActivity(bubble);
  /* RN-2 design: consecutive calls merge into 「Used N tools」. */
  const group = bubble.locator('[data-testid="tool-group-group-a"]');
  await expect(group).toHaveCount(1);
  await expect(group.locator(TURN.groupTitle)).toHaveText('Used 2 tools');
  await expect(group.locator('[data-testid="tool-group-status"]')).toHaveText('Done');
  await openToolGroups(bubble);
  await expect(group.locator(TURN.row)).toHaveCount(2);
  for (const id of ['group-a', 'group-b']) await expect(toolRow(group, id)).toBeVisible();
  await expect(toolRow(group, 'group-a').locator(TURN.target)).toHaveText('alpha');
  let detail = await openToolDetail(page, bubble, 'group-a');
  await expect(detail.locator(TURN.sourceTitle)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator(TURN.detail)).toHaveCount(0);
  detail = await openToolDetail(page, bubble, 'group-b');
  await expect(detail.locator(TURN.sourceTitle)).toContainText('Beta');

  /* Same split-point contract as the burst test above: the merged row is a
     rendering decision, the persistence is one record per call. */
  const groupCalls = await page.evaluate(() => {
    const last = window.stateStore.read("messages")[window.stateStore.read("messages").length - 1];
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
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'user-fail', role: 'user', rawText: 'Search', html: null }] });
    window.__testActivateMainView('chatView');
    await window.askChatTurn('Search');
  });

  /* Failed actions remain visible beside successful actions. */
  const bubble = page.locator('.msg.assistant').last();
  await openActivity(bubble);
  const group = bubble.locator('[data-testid="tool-group-fail-a"]');
  await expect(group.locator('[data-testid="tool-group-status"]')).toHaveText('Failed');
  await openToolGroups(bubble);
  const failed = toolRow(group, 'fail-b');
  await expect(failed).toHaveAttribute('data-state', 'error');
  await expect(failed).toHaveAttribute('data-error', '1');
  await expect(failed.locator(TURN.status)).toHaveText('Failed');
  const detail = await openToolDetail(page, bubble, 'fail-b');
  await expect(detail.locator('[data-testid="tool-detail-section-error"]')).toContainText('boom');
  await page.keyboard.press('Escape');
  /* The row that succeeded is not painted as a failure. */
  await expect(toolRow(group, 'fail-a')).toHaveAttribute('data-state', 'done');
  await expect(toolRow(group, 'fail-a').locator(TURN.status)).toHaveText('Done');
});
