// Tool activities remain visible; only per-call execution details collapse.
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
     literally stream, so this is how the fixture gets a running member. */
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
async function loadFixtureSession(page, { theme = 'dark', html = null, toolCalls = FIXTURE_CALLS } = {}) {
  await mockAuthedApp(page);
  await page.addInitScript((name) => {
    try {
      localStorage.setItem('socrates-lang-app', 'en');
      localStorage.setItem('socrates-theme', name);
    } catch (_) {}
  }, theme);
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
  await body.locator('.thinking-accordion-toggle').click();
  return body;
}

test('consecutive searches stay visible in call order without an aggregate header', async ({ page }) => {
  const body = await loadFixtureSession(page);
  await expect(body.locator('.tool-run-group')).toHaveCount(3);
  const first = body.locator('.tool-run-group').first();
  await expect(first).toHaveAttribute('data-state', 'running');
  await expect(first.locator('.tool-run-summary, .tool-run-list')).toHaveCount(0);
  expect(await first.locator('.tool-inline').evaluateAll((rows) => rows.map((row) => row.dataset.tcid))).toEqual(['s1', 's2', 's3']);
  for (const row of await first.locator('.tool-inline').all()) await expect(row).toBeVisible();
  await expect(first.locator('[data-tcid="s1"] .tool-inline-label')).toHaveText('Searched for “alpha theory”');
  await expect(first.locator('[data-tcid="s3"]')).toHaveAttribute('data-state', 'running');
  await expect(first.locator('[data-tcid="s3"] .tool-inline-label')).toHaveText('Searching "gamma theory"…');
});


test('expanding a row shows the result, and the argument dump sits behind Technical details', async ({ page }) => {
  const body = await loadFixtureSession(page);
  const group = body.locator('.tool-run-group').first();

  const row = group.locator('.tool-inline[data-tcid="s1"]');
  await row.locator(':scope > summary').click();
  await expect(row).toHaveAttribute('open', '');

  const detail = row.locator('.tool-inline-detail');
  await expect(detail.locator('.tool-inline-detail-title').first()).toHaveText('Sources');
  await expect(detail.locator('.tool-inline-src-title')).toHaveCount(2);
  await expect(detail.locator('.tool-inline-src[rel="noopener noreferrer"]')).toHaveCount(2);
  await expect(detail.locator('.tool-inline-src-date')).toHaveText('2026-07-15');
  await expect(detail.locator('.tool-inline-src-engine')).toHaveText('bing');

  /* The collapsed line keeps its count and its disclosure glyph. Both were
     `display:none!important` in the stylesheet's "compact activity row" pass,
     which the declarative renderer scopes itself out of. */
  await expect(row.locator('.tool-inline-meta')).toContainText('2 sources');
  await expect(row.locator('.tool-inline-chev')).toBeVisible();

  /* The JSON arguments are the second tier: in the DOM but not on screen until
     the toggle opens (a closed <details> keeps its children). */
  const tech = detail.locator('.tool-inline-tech');
  await expect(tech.locator('.tool-inline-tech-summary')).toContainText('Technical details');
  await expect(tech).not.toHaveAttribute('open', '');
  await expect(detail.locator('[data-kind="technical"]')).toBeHidden();
  /* A closed second tier must cost one line, not a panel: its chevron is a bare
     SVG, which without a box fills the summary and stretches the row. */
  const closedBox = await tech.boundingBox();
  expect(closedBox.height).toBeLessThan(32);
  await tech.locator('.tool-inline-tech-summary').click();
  await expect(tech).toHaveAttribute('open', '');
  const args = detail.locator('[data-kind="technical"] .tool-inline-detail-value').first();
  await expect(args).toBeVisible();
  await expect(args).toContainText('"query": "alpha theory"');

  /* And an opened row stays a readable block, not a 900px gap. */
  const rowBox = await row.boundingBox();
  expect(rowBox.height).toBeLessThan(300);
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
  const row = body.locator('.tool-inline[data-tcid="long-output"]');
  await row.locator(':scope > summary').click();
  const section = row.locator('[data-kind="output"]');
  await expect(section.locator('.tool-inline-detail-value')).toContainText('line-0:');
  await expect(section.locator('.tool-inline-detail-value')).not.toContainText('line-15:');
  await section.getByRole('button', { name: /Show all/ }).click();
  await expect(section.locator('.tool-inline-detail-value')).toContainText('line-15:');
  await section.getByRole('button', { name: 'Copy' }).click();
  expect(await page.evaluate(() => window.__copiedToolOutput)).toBe(output);
  await section.getByRole('button', { name: 'Show less' }).click();
  await expect(section.locator('.tool-inline-detail-value')).not.toContainText('line-15:');
});

test('long technical arguments stay within the expanded tool detail', async ({ page }) => {
  const longCall = {
    ...searchCall('wide-args', 'wide detail', []),
    input: { query: 'wide detail', payload: 'x'.repeat(2048) },
  };
  const body = await loadFixtureSession(page, { toolCalls: [longCall] });
  const row = body.locator('.tool-inline[data-tcid="wide-args"]');
  await row.locator(':scope > summary').click();
  await row.locator('.tool-inline-tech-summary').click();

  const value = row.locator('[data-kind="technical"] .tool-inline-detail-value');
  await expect(value).toBeVisible();
  const metrics = await value.evaluate((element) => {
    const detail = element.closest('.tool-inline-detail');
    const body = element.closest('.msg-body');
    const techSummary = element.closest('.tool-inline-tech').querySelector('summary');
    const valueStyle = getComputedStyle(element);
    return {
      valueRight: element.getBoundingClientRect().right,
      detailRight: detail.getBoundingClientRect().right,
      valueWidth: element.getBoundingClientRect().width,
      detailWidth: detail.getBoundingClientRect().width,
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      valueDisplay: valueStyle.display,
      valueMaxWidth: valueStyle.maxWidth,
      valueWrap: valueStyle.overflowWrap,
      techSummaryDisplay: getComputedStyle(techSummary).display,
    };
  });
  expect(metrics.valueDisplay).toBe('block');
  expect(metrics.valueMaxWidth).toBe('100%');
  expect(metrics.valueWrap).toBe('anywhere');
  expect(metrics.techSummaryDisplay).toBe('flex');
  expect(metrics.valueRight).toBeLessThanOrEqual(metrics.detailRight + 1);
  expect(metrics.valueWidth).toBeLessThanOrEqual(metrics.detailWidth + 1);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.bodyClientWidth + 1);
});

test('a lone call gets no aggregate header, and its failure keeps a visible Retry', async ({ page }) => {
  const body = await loadFixtureSession(page);
  const row = body.locator('.tool-inline[data-tcid="f1"]');
  await expect(row).toHaveCount(1);
  /* One row above it is the search group's live row; the lone failed search is
     a bare row, so the write group below is the only other header. */
  await expect(row.locator('.tool-inline-label')).toHaveText('Search failed: delta theory');
  await expect(row).toHaveAttribute('data-error', '1');
  await expect(row).toHaveAttribute('data-state', 'error');
  await expect(row.locator('.tool-inline-chev')).toHaveCount(1);

  await row.locator(':scope > summary').click();
  await expect(row.locator('[data-kind="error"] .tool-inline-detail-value'))
    .toContainText('Search upstream timed out after 30s');

  /* Retry must reach the legacy delegate listener as the same CustomEvent. */
  await page.evaluate(() => {
    window.__retryEvents = [];
    document.addEventListener('tool-retry', (event) => {
      window.__retryEvents.push(event.detail);
    });
  });
  await body.locator('.tool-inline-retry').click();
  const seen = await page.evaluate(() => window.__retryEvents);
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({ toolId: 'f1', tool: 'web_search', errorCode: 'SEARCH_TIMEOUT' });

  /* The error code / retryable hint is second-tier, not in the reader's way. */
  const tech = row.locator('.tool-inline-tech');
  await expect(tech.locator('.tool-inline-tech-summary')).toHaveCount(1);
  await expect(row.locator('[data-kind="technical"]').first()).toBeHidden();
  await tech.locator('.tool-inline-tech-summary').click();
  await expect(row.locator('[data-kind="technical"][data-retryable="1"]')).toBeVisible();
  await expect(row.locator('[data-kind="technical"] .tool-inline-detail-value').first())
    .toContainText('SEARCH_TIMEOUT');
});

test('each file action stays visible and opens its own result details', async ({ page }) => {
  const body = await loadFixtureSession(page);
  const write = body.locator('.tool-run-group[data-category="write"]');
  await expect(write).toHaveAttribute('data-state', 'complete');
  await expect(write.locator('.tool-run-summary')).toHaveCount(0);
  const row = write.locator('[data-tcid="w1"]');
  await expect(row.locator('.tool-inline-label')).toHaveText('Created router_v2.py');
  await expect(write.locator('[data-tcid="w2"] .tool-inline-label')).toHaveText('Edited moe.py');
  await row.locator(':scope > summary').click();
  await expect(row.locator('.tool-inline-detail')).toBeVisible();
  await expect(row.locator('.tool-inline-detail')).toContainText('router_v2.py');
});


test('answer prose keeps its recorded order around the rows, with no baked-in duplicates', async ({ page }) => {
  const body = await loadFixtureSession(page);
  const layout = await body.locator('.turn-evidence').evaluate((el) => {
    const order = [];
    for (const node of Array.from(el.children)) {
      /* Attachment hosts are mount points, not layout: React renders them next
         to a row that has a chart or file, and the history-recovery pass may
         add one for the same call. Neither is part of the answer's flow. */
      if (node.classList.contains('tool-inline-attachments')) continue;
      /* The turn-summary disclosure leads every assistant turn; it is
         chrome, not part of the prose flow. */
      if (node.classList.contains('turn-activity-surface')) {
        order.push('activity');
      } else if (node.classList.contains('tool-run-prose')) {
        order.push(`text:${(node.textContent || '').trim()}`);
      } else if (node.classList.contains('tool-run-group')) {
        for (const child of node.children) {
          if (child.classList.contains('tool-inline')) order.push(`row:${child.dataset.tcid}`);
          else order.push(`other:${child.className}`);
        }
      } else if (node.classList.contains('tool-inline')) {
        order.push(`row:${node.dataset.tcid}`);
      } else {
        order.push(`other:${node.className}`);
      }
    }
    return order;
  });
  expect(layout).toEqual([
    'activity',
    'text:Lead paragraph.',
    'other:tool-inline-error',
    'other:tool-inline-error-actions',
    'text:Middle paragraph.',
    'text:Tail paragraph.',
  ]);

  /* The stale html string carried a baked row; drawing from toolCalls[] must
     not leave it behind, and must not duplicate the legacy card chrome. */
  await expect(body.locator('.agent-tool-card')).toHaveCount(0);
  await expect(body.locator('.tool-inline')).toHaveCount(6);
  await expect(body).not.toContainText('baked row');
});

test('a narrow viewport expands individual tools in the message without a sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const body = await loadFixtureSession(page);
  const row = body.locator('.tool-inline[data-tcid="s1"]');
  await expect(row).toBeVisible();
  await row.locator(':scope > summary').click();
  await expect(row.locator(':scope > summary')).toHaveAttribute('aria-expanded', 'true');
  await expect(row.locator('.tool-inline-src-title')).toHaveCount(2);
  await expect(page.locator('.tool-run-sheet')).toHaveCount(0);
  await row.locator(':scope > summary').click();
  await expect(row.locator('.tool-inline-detail')).toHaveCount(0);
  await expect(body.locator('.tool-inline[data-tcid="s2"]')).toBeVisible();
});


test('settled, running, and failed rows share the prose column', async ({ page }) => {
  const body = await loadFixtureSession(page);
  await expect(body.locator('.tool-run-group')).toHaveCount(3);
  await body.scrollIntoViewIfNeeded();
  await body.screenshot({ path: 'test-results/tool-run-group-dark.png' });
  await body.locator('.tool-inline[data-tcid="s1"] summary').click();
  await body.screenshot({ path: 'test-results/tool-run-group-dark-open.png' });
  const icons = await body.locator('.tool-inline-tool-icon').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().left));
  expect(Math.max(...icons) - Math.min(...icons)).toBeLessThanOrEqual(1);
  const proseWidth = await body.locator('.tool-run-prose').first().evaluate((el) => {
    const p = el.querySelector('p') || el.firstElementChild;
    return p ? p.getBoundingClientRect().width : 0;
  });
  expect(proseWidth).toBeGreaterThan(200);
});


test('a running code call streams details on demand and retains expansion on completion', async ({ page }) => {
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
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'user-code', role: 'user', rawText: 'Run it', html: null }] });
    window.__testActivateMainView('chatView');
    window.__codeTurnPromise = window.askChatTurn('Run it');
  });

  await page.locator('.msg.assistant').last().locator('.thinking-accordion-toggle').click();
  const row = page.locator('.msg.assistant').last().locator('.tool-inline[data-tcid="live-code"]').last();
  await expect(row).toHaveAttribute('data-state', 'running');

  await page.evaluate(() => {
    window.__beforeToolSnapshot = window.stateStore.read('messages').at(-1);
    window.__streamArgs();
  });
  const preview = row.locator('.tool-inline-code-preview').first();
  await expect(preview).toHaveCount(0);
  await row.locator(':scope > summary').click();
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('step_39(data)');
  /* Outside every collapsible — the row itself is a plain div while in flight,
     which is the whole point of the live shape. */
  expect(await preview.evaluate((el) => Boolean(el.closest('details')))).toBe(true);

  const box = await preview.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      client: el.clientHeight,
      scroll: el.scrollHeight,
    };
  });
  const cap = parseFloat(box.maxHeight);
  expect(Number.isNaN(cap)).toBe(false);
  expect(cap).toBeLessThanOrEqual(200);
  expect(box.client).toBeLessThanOrEqual(cap + 1);
  expect(box.scroll).toBeGreaterThan(box.client);
  expect(box.overflowY).toBe('auto');

  await page.evaluate(() => window.__streamStdout());
  const output = row.locator('.tool-inline-code-preview.is-output');
  await expect(output).toBeVisible();
  await expect(output).toContainText('running step_0');
  await row.screenshot({ path: 'test-results/tool-run-live-preview.png' });
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
  /* A settled row reports results, not the stream it came from: the program now
     sits behind Technical details and the output in the result section. */
  await expect(row.locator('.tool-inline-code-preview')).toHaveCount(0);
  await expect(row).toHaveAttribute('open', '');
  await expect(row.locator('[data-kind=output]')).toContainText('all steps ran');
});

test('a pending approval stays visible outside a collapsed tool row', async ({ page }) => {
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

  const row = page.locator('.msg.assistant').last().locator('.tool-inline[data-tcid="approval-tool"]');
  await expect(row).toHaveAttribute('data-state', 'running');
  await page.evaluate(() => window.__requestToolApproval());
  const prompt = page.locator('.tool-inline-approval');
  await expect(row).toHaveAttribute('data-state', 'awaiting');
  await expect(prompt).toBeVisible();
  await expect(row).not.toHaveAttribute('open', '');
  await expect(prompt.getByRole('button', { name: 'Allow once' })).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Decline' })).toBeVisible();

  await prompt.locator('[data-approval-action="accept"]').click();
  await expect(prompt.locator('.tool-inline-approval-status')).toHaveText('Approved');
  expect(decisions).toEqual([{ method: 'POST', body: { decision: 'accept' } }]);
});
