// RN-2 activity rail: every tool call is one row on the turn's hairline rail,
// and a row opens its own detail inline beneath the label.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SESSION_ID = '88888888-8888-4888-8888-888888888888';

const A = 'Lead paragraph.';
const B = 'Middle paragraph.';
const C = 'Tail paragraph.';
const RAW_TEXT = `${A}\n\n${B}\n\n${C}`;
const OFF_B = A.length + 2;
const OFF_C = A.length + 2 + B.length + 2;

function searchCall(id, query, sources) {
  return {
    id,
    name: 'web_search',
    input: { query },
    output: `${sources.length} results`,
    results: sources,
    durationMs: 1200,
    status: 'completed',
    textOffset: 0,
  };
}

const FIXTURE_CALLS = [
  searchCall('s1', 'alpha theory', [
    { title: 'Alpha one', url: 'https://example.test/alpha-one', snippet: 'First', date: '2026-07-15', source: 'bing' },
    { title: 'Alpha two', url: 'https://example.test/alpha-two', snippet: 'Second' },
  ]),
  searchCall('s2', 'beta theory', [
    { title: 'Beta one', url: 'https://example.test/beta-one', snippet: 'Third' },
  ]),
  /* No output, no status, no duration → still in flight. History cannot
     literally stream, so this is how the fixture gets a running row. */
  {
    id: 's3',
    name: 'web_search',
    input: { query: 'gamma theory' },
    textOffset: 0,
  },
  {
    id: 'f1',
    name: 'web_search',
    input: { query: 'delta theory' },
    output: null,
    isError: true,
    status: 'failed',
    error: 'Search upstream timed out after 30s',
    errorCode: 'SEARCH_TIMEOUT',
    retryable: true,
    durationMs: 400,
    textOffset: OFF_B,
  },
  {
    id: 'w1',
    name: 'Write',
    input: { file_path: 'src/router_v2.py', content: 'def route():\n    return 1\n' },
    output: 'Created src/router_v2.py',
    durationMs: 300,
    status: 'completed',
    textOffset: OFF_C,
  },
  {
    id: 'w2',
    name: 'Edit',
    input: { file_path: 'src/moe.py', old_string: 'x', new_string: 'y' },
    output: 'The file src/moe.py has been updated.',
    durationMs: 250,
    status: 'completed',
    textOffset: OFF_C,
  },
];

/* The theme is a `data-mode` attribute the app derives from
   `localStorage['socrates-theme']` at boot, so a screenshot pass has to pin it
   before navigation rather than poke an attribute afterwards. Later init
   scripts run later, so calling this again on the same page re-themes it. */
async function loadFixtureSession(page, { theme = 'dark', html = null, toolCalls = FIXTURE_CALLS, language = 'en' } = {}) {
  await mockAuthedApp(page);
  await page.addInitScript(({ name, appLanguage }) => {
    try {
      localStorage.setItem('socrates-lang-app', appLanguage);
      localStorage.setItem('socrates-theme', name);
    } catch (_) {}
  }, { name: theme, appLanguage: language });
  await page.route(new RegExp('/api/(?:v2/)?sessions/' + SESSION_ID + '(?:\\?.*)?$'), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: SESSION_ID,
        topic: 'Tool run layout',
        title: 'Tool run layout',
        domain: 'ml',
        mode: 'chat',
        kind: 'chat',
        phase: 'chat',
        messages: [
          { id: 'tr-user', role: 'user', rawText: 'Look into MoE routing', html: '<p>Look into MoE routing</p>' },
          {
            id: 'tr-assistant',
            role: 'assistant',
            rawText: RAW_TEXT,
            /* Deliberately stale: the declarative renderer must draw the rows
               from toolCalls[], never from this string. */
            html: html === null
              ? '<p>Lead paragraph.</p><details class="tool-inline"><summary>baked row</summary></body></details>'
              : html,
            toolCalls,
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
  await page.evaluate((id) => window.loadSession(id), SESSION_ID);
  const body = page.locator('#msgList .msg.assistant').last().locator('.msg-body');
  await body.getByTestId('turn-activity-toggle').click();
  return body;
}

async function openDetail(page, body, id) {
  const toggle = body.getByTestId('turn-activity-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await body.getByTestId(`tool-row-${id}`).click();
  const detail = page.getByTestId('tool-detail');
  await expect(detail).toBeVisible();
  return detail;
}

test('every call is one row on the rail, in call order', async ({ page }) => {
  const body = await loadFixtureSession(page);
  expect(await body.locator('.rn-tool-row').evaluateAll((rows) => rows.map((row) => row.dataset.tcid)))
    .toEqual(['s1', 's2', 's3', 'f1', 'w1', 'w2']);
  const s1 = body.getByTestId('tool-row-s1');
  await expect(s1).toContainText('alpha theory');
  await expect(body.getByTestId('tool-row-w1')).toContainText('router_v2.py');
  await expect(body.getByTestId('tool-row-w2')).toContainText('moe.py');
  // A row that is still in flight leads with the spinner; settled rows do not.
  await expect(body.locator('.rn-tool-row[data-tcid="s3"]')).toHaveAttribute('data-state', 'running');
  await expect(body.locator('.rn-tool-row[data-tcid="s3"]').getByTestId('thinking-step-spinner')).toHaveCount(1);
  await expect(s1.getByTestId('thinking-step-spinner')).toHaveCount(0);
  await expect(body.locator('.rn-tool-row[data-tcid="f1"]')).toHaveAttribute('data-state', 'error');
});

test('a row opens its detail inline, and closes on a second press', async ({ page }) => {
  const body = await loadFixtureSession(page);
  const row = body.getByTestId('tool-row-s1');
  await expect(row).toHaveAttribute('aria-expanded', 'false');
  const detail = await openDetail(page, body, 's1');
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  expect(await detail.getAttribute('role')).toBe(null);
  await expect(detail.getByTestId('tool-detail-section-input')).toContainText('"query": "alpha theory"');
  const sources = detail.getByTestId('tool-detail-section-sources');
  await expect(sources.getByTestId('tool-source')).toHaveCount(2);
  await expect(sources.getByTestId('tool-source-title').first()).toHaveText('Alpha one');
  await expect(sources.getByTestId('tool-source-host').first()).toHaveText('example.test');
  await expect(sources.getByTestId('tool-source').first()).toHaveAttribute('role', 'link');
  // The panel sits inside the prose column, under its own row.
  expect(await detail.evaluate((el) => Boolean(el.closest('.rn-tool-row[data-tcid="s1"]')))).toBe(true);
  await row.click();
  await expect(page.getByTestId('tool-detail')).toHaveCount(0);
});

test('keyboard activation toggles the row disclosure', async ({ page }) => {
  const body = await loadFixtureSession(page);
  const row = body.getByTestId('tool-row-s1');
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('aria-expanded', 'false');
});

test('long tool output expands and copies the complete source text', async ({ page }) => {
  const output = Array.from({ length: 30 }, (_, i) => `line-${i}: ${'x'.repeat(500)}`).join('\n');
  const call = { id: 'long-output', name: 'code_interpreter', input: { code: 'print(1)' }, output, status: 'completed', textOffset: 0 };
  const body = await loadFixtureSession(page, { toolCalls: [call] });
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => { window.__copiedToolOutput = text; } },
    });
  });
  const detail = await openDetail(page, body, 'long-output');
  const section = detail.getByTestId('tool-detail-section-output');
  const block = section.getByTestId('tool-code-output');
  await expect(block).toContainText('line-0:');
  await expect(block).not.toContainText('line-15:');
  const expand = section.getByTestId('tool-output-expand');
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expand.click();
  await expect(expand).toHaveAttribute('aria-expanded', 'true');
  await expect(block).toContainText('line-15:');
  await section.getByTestId('tool-code-copy').click();
  await expect(section.getByTestId('tool-code-copy')).toHaveText('Copied');
  expect(await page.evaluate(() => window.__copiedToolOutput)).toBe(output);
  await expand.click();
  await expect(block).not.toContainText('line-15:');
});

test('long arguments stay inside the inline panel viewport', async ({ page }) => {
  const longCall = {
    ...searchCall('wide-args', 'wide detail', []),
    input: { query: 'wide detail', payload: 'x'.repeat(2048) },
  };
  const body = await loadFixtureSession(page, { toolCalls: [longCall] });
  const detail = await openDetail(page, body, 'wide-args');
  const input = detail.getByTestId('tool-detail-section-input');
  await expect(input).toContainText('wide detail');
  const bounds = await input.evaluate((element) => ({
    right: element.getBoundingClientRect().right,
    viewport: document.documentElement.clientWidth,
  }));
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
});

test('a failure keeps a readable reason and a Retry in the transcript', async ({ page }) => {
  const body = await loadFixtureSession(page);
  const notice = body.getByTestId('tool-error');
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveAttribute('role', 'alert');
  await expect(notice.getByTestId('tool-error-message')).toHaveText('Search upstream timed out after 30s');
  await expect(body.locator('.rn-tool-row[data-tcid="f1"]')).toHaveAttribute('data-error', '1');

  /* Retry must reach the legacy delegate listener as the same CustomEvent. */
  await page.evaluate(() => {
    window.__retryEvents = [];
    document.addEventListener('tool-retry', (event) => {
      window.__retryEvents.push(event.detail);
    });
  });
  await notice.getByTestId('tool-error-retry').click();
  const seen = await page.evaluate(() => window.__retryEvents);
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({ toolId: 'f1', tool: 'web_search', errorCode: 'SEARCH_TIMEOUT' });

  /* The inline panel carries the full error and the error code as a footnote. */
  const detail = await openDetail(page, body, 'f1');
  await expect(detail.getByTestId('tool-detail-section-error')).toContainText('Search upstream timed out after 30s');
  await expect(detail.getByTestId('tool-detail-section-technical')).toContainText('SEARCH_TIMEOUT');
});

test('each file action names its file in the row and in its own details', async ({ page }) => {
  const body = await loadFixtureSession(page);
  const w1 = body.getByTestId('tool-row-w1');
  await expect(w1).toContainText('router_v2.py');
  const w2 = body.getByTestId('tool-row-w2');
  await expect(w2).toContainText('moe.py');
  const detail = await openDetail(page, body, 'w1');
  await expect(detail).toContainText('router_v2.py');
});

test('answer prose keeps its recorded order around the rows, with no baked-in duplicates', async ({ page }) => {
  const body = await loadFixtureSession(page);
  const layout = await body.locator('.turn-evidence').evaluate((el) => {
    const order = [];
    for (const node of Array.from(el.children)) {
      if (node.classList.contains('tool-inline-attachments')) continue;
      if (node.classList.contains('rn-turn-activity')) order.push('activity');
      else if (node.classList.contains('tool-run-prose')) order.push(`text:${(node.textContent || '').trim()}`);
      else if (node.classList.contains('rn-tool-actions')) order.push(`actions:${node.dataset.toolActions}`);
      else order.push(`other:${node.className}`);
    }
    return order;
  });
  expect(layout).toEqual([
    'activity',
    'text:Lead paragraph.',
    'actions:f1',
    'text:Middle paragraph.',
    'text:Tail paragraph.',
  ]);
  await expect(body.locator('.agent-tool-card')).toHaveCount(0);
  await expect(body.locator('.rn-tool-row')).toHaveCount(6);
  await expect(body).not.toContainText('baked row');
});

test('narrow viewports keep the inline panel inside the transcript column', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const body = await loadFixtureSession(page);
  const detail = await openDetail(page, body, 's1');
  const box = await detail.boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  const panel = await detail.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1);
  await expect(detail.getByTestId('tool-source')).toHaveCount(2);
  await body.getByTestId('tool-row-s1').click();
  await expect(page.getByTestId('tool-detail')).toHaveCount(0);
  await expect(body.getByTestId('tool-row-s2')).toBeVisible();
});

test('phone rows stay horizontal, touch-height and one line', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const body = await loadFixtureSession(page, { theme: 'light', language: 'zh' });

  const activity = body.getByTestId('turn-activity-toggle');
  const activityLayout = await activity.evaluate((element) => ({
    direction: getComputedStyle(element).flexDirection,
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
    height: element.getBoundingClientRect().height,
  }));
  expect(activityLayout.direction).toBe('row');
  expect(activityLayout.scrollWidth).toBeLessThanOrEqual(activityLayout.width + 1);
  expect(activityLayout.height).toBeGreaterThanOrEqual(44);
  const retry = body.getByTestId('tool-error-retry');
  await expect(retry).toBeVisible();
  expect((await retry.boundingBox()).height).toBeGreaterThanOrEqual(44);

  const row = body.getByTestId('tool-row-s1');
  const rowLayout = await row.evaluate((element) => ({
    direction: getComputedStyle(element).flexDirection,
    wrap: getComputedStyle(element).flexWrap,
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
    height: element.getBoundingClientRect().height,
  }));
  expect(rowLayout.direction).toBe('row');
  expect(rowLayout.wrap).toBe('nowrap');
  expect(rowLayout.scrollWidth).toBeLessThanOrEqual(rowLayout.width + 1);
  expect(rowLayout.height).toBeGreaterThanOrEqual(44);
  await body.scrollIntoViewIfNeeded();
  await body.screenshot({ path: 'test-results/tool-run-group-mobile-320-open.png' });

  const detail = await openDetail(page, body, 's1');
  const detailLayout = await detail.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(detailLayout.width).toBeLessThanOrEqual(320);
  expect(detailLayout.scrollWidth).toBeLessThanOrEqual(detailLayout.clientWidth + 1);
});

test('rows share one icon column and the prose column', async ({ page }) => {
  const body = await loadFixtureSession(page);
  await body.scrollIntoViewIfNeeded();
  await body.screenshot({ path: 'test-results/tool-run-group-dark-open.png' });
  const icons = await body.locator('.rn-tool-row .tool-inline-tool-icon').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().left));
  /* Five settled rows carry their tool glyph; the in-flight row leads with
     the shared spinner instead, so it contributes no icon. */
  expect(icons.length).toBe(5);
  expect(Math.max(...icons) - Math.min(...icons)).toBeLessThanOrEqual(1);
  await expect(body.locator('.rn-tool-row[data-tcid="s3"]').getByTestId('thinking-step-spinner')).toHaveCount(1);
  const proseWidth = await body.locator('.tool-run-prose').first().evaluate((el) => {
    const p = el.querySelector('p') || el.firstElementChild;
    return p ? p.getBoundingClientRect().width : 0;
  });
  expect(proseWidth).toBeGreaterThan(200);
});

test('a running code call streams into the open panel and keeps it open on completion', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    let push = null;
    let ref = null;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (!url.includes('/chat/stream')) return nativeFetch(input, init);
      const stream = new ReadableStream({
        start(controller) {
          ref = controller;
          push = (text) => controller.enqueue(encoder.encode(text));
          push(frame('tool_use', [{ id: 'live-code', name: 'code_interpreter', input: { code: '' } }]));
        },
      });
      /* Cumulative partial JSON, exactly as the backend sends it. Long enough
         on purpose that the box has to scroll instead of growing. */
      const code = Array.from({ length: 40 }, (_, i) => `step_${i}(data)`).join('\n');
      window.__streamArgs = () => push(frame('tool_call_delta', {
        id: 'live-code', index: 0, arguments: '{"code":' + JSON.stringify(code),
      }));
      window.__streamStdout = () => push(frame('tool_progress', {
        id: 'live-code', phase: 'stdout', elapsedMs: 420, chunk: 'running step_0\n',
      }));
      window.__finishCode = () => {
        push(frame('tool_result', { id: 'live-code', ok: true, status: 'completed', output: 'all steps ran' }));
        push('data: {"choices":[{"delta":{"content":"All steps ran."}}]}\n\n');
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
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    const sessionId = '55555555-5555-4555-8555-555555555555';
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'user-code', role: 'user', rawText: 'Run it', html: null }] });
    window.__testActivateMainView('chatView');
    window.__codeTurnPromise = window.askChatTurn('Run it');
  });

  const bubble = page.locator('.msg.assistant').last();
  const row = bubble.locator('.rn-tool-row[data-tcid="live-code"]').last();
  await expect(row).toHaveAttribute('data-state', 'running');
  await expect(bubble.getByTestId('turn-activity-label')).toContainText('Executing code');
  await expect(bubble.getByTestId('turn-activity-duration')).toContainText(/\d/);

  await page.evaluate(() => {
    window.__beforeToolSnapshot = window.stateStore.read('messages').at(-1);
    window.__streamArgs();
  });
  const preview = page.getByTestId('tool-live-preview');
  await expect(preview).toHaveCount(0);
  const detail = await openDetail(page, bubble, 'live-code');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('step_39(data)');
  const box = await preview.evaluate((el) => ({
    maxHeight: getComputedStyle(el).maxHeight,
    client: el.clientHeight,
    scroll: el.scrollHeight,
  }));
  const cap = parseFloat(box.maxHeight);
  expect(Number.isNaN(cap)).toBe(false);
  expect(cap).toBeLessThanOrEqual(200);
  expect(box.client).toBeLessThanOrEqual(cap + 1);
  expect(box.scroll).toBeGreaterThan(box.client);

  await page.evaluate(() => window.__streamStdout());
  const output = page.getByTestId('tool-live-output');
  await expect(output).toBeVisible();
  await expect(output).toContainText('running step_0');
  await detail.screenshot({ path: 'test-results/tool-run-live-preview.png' });
  const snapshotChecks = await page.evaluate(() => {
    const current = window.stateStore.read('messages').at(-1);
    const call = current.toolCalls[0];
    const previous = window.__beforeToolSnapshot;
    return {
      frozen: Object.isFrozen(current) && Object.isFrozen(call) && Object.isFrozen(call.input),
      replaced: previous !== current && previous.toolCalls !== current.toolCalls,
      previousOutput: previous.toolCalls[0]._liveOutput ?? null,
      previousArguments: previous.toolCalls[0].argumentsText ?? null,
      currentOutput: call._liveOutput,
      privateBuffer: '_liveBuffer' in call || '_pendingDeltas' in call || '_orphanProgress' in current,
      persistedRuntime: '_run' in JSON.parse(JSON.stringify(call)),
    };
  });
  expect(snapshotChecks).toEqual({
    frozen: true, replaced: true, previousOutput: null, previousArguments: null,
    currentOutput: 'running step_0', privateBuffer: false, persistedRuntime: false,
  });

  await page.evaluate(() => window.__finishCode());
  await expect(row).toHaveAttribute('data-state', 'done');
  /* A settled call reports results, not the stream: the open panel swaps the
     live blocks for the output section and stays open. */
  await expect(page.getByTestId('tool-live-preview')).toHaveCount(0);
  await expect(page.getByTestId('tool-detail')).toBeVisible();
  await expect(page.getByTestId('tool-detail-section-output')).toContainText('all steps ran');
});

test('a pending approval stays visible in the transcript with pill decisions', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    let push = null;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (!url.includes('/chat/stream')) return nativeFetch(input, init);
      const stream = new ReadableStream({ start(controller) {
        push = (event, data) => controller.enqueue(encoder.encode(frame(event, data)));
        push('tool_use', [{ id: 'approval-tool', name: 'workspace_agent', input: { command: 'npm test' } }]);
        window.__requestToolApproval = () => push('tool_approval', {
          id: 'approval-tool', runId: 'run-approval', approvalId: 'approval-123',
          kind: 'commandExecution', command: 'npm test', cwd: '/workspace',
          reason: 'Validate the project', status: 'pending',
          availableDecisions: ['accept', 'decline'],
        });
      } });
      return Promise.resolve(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  });
  await mockAuthedApp(page);
  await page.addInitScript(() => localStorage.setItem('socrates-lang-app', 'en'));
  const decisions = [];
  await page.route(/\/api\/(?:v2\/)?agent-runs\/run-approval\/approvals\/approval-123(?:\?.*)?$/, async (route) => {
    decisions.push({ method: route.request().method(), body: route.request().postDataJSON() });
    await route.fulfill({ json: { ok: true } });
  });
  await page.route(/\/api\/(?:v2\/)?agent-runs\/run-approval(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { run: { status: 'completed', summary: 'Command approved and completed.' }, artifacts: [] } });
    } else {
      await route.fallback();
    }
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    const sessionId = '66666666-6666-4666-8666-666666666666';
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: sessionId });
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [{ clientId: 'user-approval', role: 'user', rawText: 'Run the tests', html: null }] });
    window.__testActivateMainView('chatView');
    window.__approvalTurnPromise = window.askChatTurn('Run the tests');
  });

  const row = page.locator('.msg.assistant').last().locator('.rn-tool-row[data-tcid="approval-tool"]');
  await expect(row).toHaveAttribute('data-state', 'running');
  await page.evaluate(() => window.__requestToolApproval());
  const prompt = page.locator('.rn-tool-approval');
  await expect(row).toHaveAttribute('data-state', 'awaiting');
  await expect(prompt).toBeVisible();
  await expect(prompt).toHaveAttribute('role', 'region');
  await expect(page.getByTestId('tool-detail')).toHaveCount(0);
  await expect(prompt.getByRole('button', { name: 'Allow once' })).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Decline' })).toBeVisible();
  await expect(prompt.locator('[data-approval-action="acceptForSession"]')).toHaveCount(0);
  await expect(prompt.locator('[data-approval-action="stop"]')).toHaveCount(0);

  await prompt.locator('[data-approval-action="accept"]').click();
  await expect(prompt.getByTestId('tool-approval-status')).toHaveText('Approved');
  expect(decisions).toEqual([{ method: 'POST', body: { decision: 'accept' } }]);
});
