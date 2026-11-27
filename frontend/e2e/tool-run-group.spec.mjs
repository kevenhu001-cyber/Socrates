// Tool execution is part of the transcript and opens its detail in place.
import { test, expect } from './_state-fixture.mjs';
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
    {
      title: 'Alpha one',
      url: 'https://example.test/alpha-one',
      snippet: 'First',
      date: '2026-07-15',
      source: 'bing',
    },
    { title: 'Alpha two', url: 'https://example.test/alpha-two', snippet: 'Second' },
  ]),
  searchCall('s2', 'beta theory', [
    { title: 'Beta one', url: 'https://example.test/beta-one', snippet: 'Third' },
  ]),
  /* An old session can omit all execution outcome fields. */
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
async function loadFixtureSession(
  page,
  { theme = 'dark', html = null, toolCalls = FIXTURE_CALLS, language = 'en', expandBursts = true } = {},
) {
  await mockAuthedApp(page);
  await page.addInitScript(
    ({ name, appLanguage }) => {
      try {
        localStorage.setItem('socrates-lang-app', appLanguage);
        localStorage.setItem('socrates-theme', name);
      } catch (_) {}
    },
    { name: theme, appLanguage: language },
  );
  await page.route(
    new RegExp('/api/(?:v2/)?sessions/' + SESSION_ID + '(?:\\?.*)?$'),
    async (route) => {
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
            {
              id: 'tr-user',
              role: 'user',
              rawText: 'Look into MoE routing',
              html: '<p>Look into MoE routing</p>',
            },
            {
              id: 'tr-assistant',
              role: 'assistant',
              rawText: RAW_TEXT,
              /* Deliberately stale: the declarative renderer must draw the rows
               from toolCalls[], never from this string. */
              html:
                html === null
                  ? '<p>Lead paragraph.</p><details class="tool-inline"><summary>baked row</summary></body></details>'
                  : html,
              toolCalls,
            },
          ],
          kbNodes: [],
          mistakes: [],
        }),
      });
    },
  );
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.waitForFunction(() => typeof window.loadSession === 'function', null, {
    timeout: 15_000,
  });
  await page.evaluate((id) => window.loadSession(id), SESSION_ID);
  const body = page.locator('#msgList .msg.assistant').last().locator('.msg-body');
  if (expandBursts && toolCalls.length) {
    await expect(body.locator('.rn-tool-row').first()).toBeAttached();
    const collapsed = body.locator('[data-testid=\"turn-activity-toggle\"][aria-expanded="false"]');
    while (await collapsed.count()) await collapsed.first().click();
  }
  return body;
}

async function openDetail(page, body, id) {
  await body.getByTestId(`tool-row-${id}`).click();
  const detail = page.getByTestId('tool-detail');
  await expect(detail).toBeVisible();
  return detail;
}

test('expanded calls are visible in call order', async ({ page }) => {
  const body = await loadFixtureSession(page);
  await expect(body.locator('.rn-tool-row')).toHaveCount(6);
  expect(
    await body.locator('.rn-tool-row').evaluateAll((rows) => rows.map((row) => row.dataset.tcid)),
  ).toEqual(['s1', 's2', 's3', 'f1', 'w1', 'w2']);
  const s1 = body.getByTestId('tool-row-s1');
  await expect(s1).toContainText('alpha theory');
  await expect(body.getByTestId('tool-row-w1')).toContainText('router_v2.py');
  await expect(body.getByTestId('tool-row-w2')).toContainText('moe.py');
  // A restored row with no recorded outcome shows a neutral status.
  await expect(body.locator('.rn-tool-row[data-tcid="s3"]')).toHaveAttribute(
    'data-state',
    'running',
  );
  await expect(
    body.locator('.rn-tool-row[data-tcid="s3"]').getByTestId('thinking-step-spinner'),
  ).toHaveCount(0);
  await expect(body.getByTestId('tool-row-s3').getByTestId('thinking-step-status')).toHaveText(
    'Status unknown',
  );
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
  await expect(detail.getByTestId('tool-detail-section-input')).toHaveCount(0);
  await expect(detail.getByTestId('tool-input-toggle')).toHaveCount(0);
  const sources = detail.getByTestId('tool-detail-section-sources');
  await expect(sources.getByTestId('tool-source')).toHaveCount(2);
  await expect(sources.getByTestId('tool-source-title').first()).toHaveText('Alpha one');
  await expect(sources.getByTestId('tool-source-host').first()).toHaveText('example.test');
  await expect(sources.getByTestId('tool-source').first()).toHaveAttribute('role', 'link');
  await sources.getByTestId('tool-sources-open').click();
  const panel = page.locator('#sourcesPanel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.source-card')).toHaveCount(2);
  await expect(panel.locator('.source-card-title').first()).toHaveText('Alpha one');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  // The panel sits inside the prose column, under its own row.
  expect(await detail.evaluate((el) => Boolean(el.closest('.rn-tool-row[data-tcid="s1"]')))).toBe(
    true,
  );
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

test('raw Python output and search JSON never enter expanded tool details', async ({ page }) => {
  const calls = [
    { id: 'raw-python', name: 'code_interpreter', input: { code: 'print("private_python_probe")' },
      output: 'private_stdout_probe', status: 'completed', textOffset: 0 },
    { ...searchCall('raw-search', 'wide detail', [{ title: 'Public result', url: 'https://example.test/a' }]),
      input: { query: 'wide detail', payload: 'private_arg_probe' },
      output: '{"raw":"private_json_probe"}' },
  ];
  const body = await loadFixtureSession(page, { toolCalls: calls });
  await expect(body.getByTestId('tool-row-raw-python')).not.toHaveAttribute('aria-expanded', /.+/);
  await expect(page.getByTestId('tool-detail')).toHaveCount(0);
  const detail = await openDetail(page, body, 'raw-search');
  await expect(detail.getByTestId('tool-code-output')).toHaveCount(0);
  await expect(detail.getByTestId('tool-input-toggle')).toHaveCount(0);
  await expect(detail.getByTestId('tool-source')).toHaveCount(1);
  await body.getByTestId('tool-row-raw-search').click();
  await expect(body).not.toContainText(/private_(python|stdout|arg|json)_probe/);
});

test('tool failures remain visible as status without a technical disclosure', async ({ page }) => {
  const body = await loadFixtureSession(page);
  await expect(body.getByTestId('tool-error')).toHaveCount(0);
  await expect(body.getByTestId('tool-error-retry')).toHaveCount(0);
  await expect(body.getByText('Search upstream timed out after 30s')).toHaveCount(0);
  await expect(body.locator('.rn-tool-row[data-tcid="f1"]')).toHaveAttribute('data-error', '1');
  await expect(body.getByTestId('tool-row-f1')).not.toHaveAttribute('aria-expanded', /.+/);
  await expect(page.getByTestId('tool-detail')).toHaveCount(0);
  await expect(body).not.toContainText('Search upstream timed out after 30s');
  await expect(body).not.toContainText('SEARCH_TIMEOUT');
});

test('each file action names its file without repeating its label in an empty detail', async ({ page }) => {
  const body = await loadFixtureSession(page);
  const w1 = body.getByTestId('tool-row-w1');
  await expect(w1).toContainText('router_v2.py');
  const w2 = body.getByTestId('tool-row-w2');
  await expect(w2).toContainText('moe.py');
  await expect(w1).not.toHaveAttribute('aria-expanded', /.+/);
  await expect(w2).not.toHaveAttribute('aria-expanded', /.+/);
  await expect(page.getByTestId('tool-detail')).toHaveCount(0);
});

test('answer prose keeps its recorded order around the rows, with no baked-in duplicates', async ({
  page,
}) => {
  const body = await loadFixtureSession(page);
  const layout = await body.locator('.turn-evidence').evaluate((el) => {
    const order = [];
    for (const node of Array.from(el.querySelectorAll('.rn-tool-row, .tool-run-prose'))) {
      if (node.classList.contains('rn-tool-row')) order.push(`tool:${node.dataset.tcid}`);
      else order.push(`text:${(node.textContent || '').trim()}`);
    }
    return order;
  });
  expect(layout).toEqual([
    'tool:s1',
    'tool:s2',
    'tool:s3',
    'tool:f1',
    'tool:w1',
    'tool:w2',
    'text:Lead paragraph.',
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
  await expect(detail.locator('.tool-source-result').first()).toHaveCSS('border-top-width', '0px');
  await expect(detail.locator('.tool-source-name').first()).toHaveCSS('overflow-wrap', 'anywhere');
  await body.getByTestId('tool-row-s1').click();
  await expect(page.getByTestId('tool-detail')).toHaveCount(0);
  await expect(body.getByTestId('tool-row-s2')).toBeVisible();
});

test('phone rows stay horizontal, touch-height and one line', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const body = await loadFixtureSession(page, { theme: 'light', language: 'zh' });

  const activity = body.locator('[data-testid=\"turn-activity-toggle\"]').first();
  await expect(activity).toBeVisible();
  expect((await activity.boundingBox()).height).toBeGreaterThanOrEqual(44);

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
  const row = body.getByTestId('tool-row-s1');
  await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(row).toHaveCSS('border-top-width', '0px');
  await expect(row.getByTestId('thinking-step-status')).toHaveCount(0);
  const prose = body.locator('.tool-run-prose p').first();
  await expect(row).toHaveCSS(
    'font-size',
    await prose.evaluate((node) => getComputedStyle(node).fontSize),
  );
  expect((await row.boundingBox()).x).toBeGreaterThan((await prose.boundingBox()).x);
  const icons = await body
    .locator('.rn-tool-row .tool-run-trigger > :is(.tool-inline-tool-icon, .tool-site-marks, .activity-step-glyph):first-child')
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().left));
  expect(icons.length).toBe(6);
  await expect(
    body.locator('.rn-tool-row[data-tcid="w1"] .tool-inline-tool-icon svg'),
  ).toBeVisible();
  expect(Math.max(...icons) - Math.min(...icons)).toBeLessThanOrEqual(1);
  await expect(
    body.locator('.rn-tool-row[data-tcid="s3"]').getByTestId('thinking-step-spinner'),
  ).toHaveCount(0);
  const proseWidth = await body
    .locator('.tool-run-prose')
    .first()
    .evaluate((el) => {
      const p = el.querySelector('p') || el.firstElementChild;
      return p ? p.getBoundingClientRect().width : 0;
    });
  expect(proseWidth).toBeGreaterThan(200);
});

test('a running code call streams into the open panel and keeps it open on completion', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    let push = null;
    let ref = null;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input && input.url ? input.url : '';
      if (!url.includes('/chat/stream')) return nativeFetch(input, init);
      const stream = new ReadableStream({
        start(controller) {
          ref = controller;
          push = (text) => controller.enqueue(encoder.encode(text));
          push(
            frame('tool_use', [{ id: 'live-code', name: 'code_interpreter', input: { code: '' } }]),
          );
        },
      });
      /* Cumulative partial JSON, exactly as the backend sends it. Long enough
         on purpose that the box has to scroll instead of growing. */
      const code = Array.from({ length: 40 }, (_, i) => `step_${i}(data)`).join('\n');
      window.__streamArgs = () =>
        push(
          frame('tool_call_delta', {
            id: 'live-code',
            index: 0,
            arguments: '{"code":' + JSON.stringify(code),
          }),
        );
      window.__streamStdout = () =>
        push(
          frame('tool_progress', {
            id: 'live-code',
            phase: 'stdout',
            elapsedMs: 420,
            chunk: 'running step_0\n',
          }),
        );
      window.__finishCode = () => {
        push(
          frame('tool_result', {
            id: 'live-code',
            ok: true,
            status: 'completed',
            output: 'all steps ran',
          }),
        );
        push('data: {"choices":[{"delta":{"content":"All steps ran."}}]}\n\n');
        push('data: [DONE]\n\n');
        ref.close();
      };
      return Promise.resolve(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );
    };
  });
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    const sessionId = '55555555-5555-4555-8555-555555555555';
    window.__socratesTestState.patch({ session: { phase: 'chat' } });
    window.__socratesTestState.patch({ session: { currentSessionId: sessionId } });
    window.__socratesTestState.patch({
      session: {
        messages: [{ clientId: 'user-code', role: 'user', rawText: 'Run it', html: null }],
      },
    });
    window.__testActivateMainView('chatView');
    window.__codeTurnPromise = window.askChatTurn('Run it');
  });

  const bubble = page.locator('.msg.assistant').last();
  const row = bubble.locator('.rn-tool-row[data-tcid="live-code"]').last();
  await expect(row).toHaveAttribute('data-state', 'running');
  await expect(row.getByTestId('thinking-step-title')).toContainText('Executing code');
  await bubble.getByTestId('turn-activity-toggle').click();
  await expect(row.getByTestId('thinking-step-spinner')).toBeVisible();

  await page.evaluate(() => {
    window.__beforeToolSnapshot = window.__socratesTestState.session().messages.at(-1);
    window.__streamArgs();
  });
  const preview = page.getByTestId('tool-live-preview');
  await expect(preview).toHaveCount(0);
  await expect(bubble.getByTestId('tool-row-live-code')).not.toHaveAttribute('aria-expanded', /.+/);
  await expect(preview).toHaveCount(0);
  await expect(bubble).not.toContainText('step_39(data)');
  await page.evaluate(() => window.__streamStdout());
  await expect(page.getByTestId('tool-live-output')).toHaveCount(0);
  await expect(bubble).not.toContainText('running step_0');
  const snapshotChecks = await page.evaluate(() => {
    const current = window.__socratesTestState.session().messages.at(-1);
    const call = current.toolCalls[0];
    const previous = window.__beforeToolSnapshot;
    return {
      frozen: Object.isFrozen(current) && Object.isFrozen(call) && Object.isFrozen(call.input),
      replaced: previous !== current && previous.toolCalls !== current.toolCalls,
      previousOutput: previous.toolCalls[0]._liveOutput ?? null,
      previousArguments: previous.toolCalls[0].argumentsText ?? null,
      currentOutput: call._liveOutput,
      privateBuffer:
        '_liveBuffer' in call || '_pendingDeltas' in call || '_orphanProgress' in current,
      persistedRuntime: '_run' in JSON.parse(JSON.stringify(call)),
    };
  });
  expect(snapshotChecks).toEqual({
    frozen: true,
    replaced: true,
    previousOutput: null,
    previousArguments: null,
    currentOutput: 'running step_0',
    privateBuffer: false,
    persistedRuntime: false,
  });

  await page.evaluate(() => window.__finishCode());
  await expect(row).toHaveAttribute('data-state', 'done');
  /* Raw streaming and settled logs remain outside the public surface. */
  await expect(page.getByTestId('tool-live-preview')).toHaveCount(0);
  await expect(page.getByTestId('tool-detail')).toHaveCount(0);
  await expect(page.getByTestId('tool-detail-section-output')).toHaveCount(0);
});

test('a pending approval stays visible in the transcript with pill decisions', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    let push = null;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input && input.url ? input.url : '';
      if (!url.includes('/chat/stream')) return nativeFetch(input, init);
      const stream = new ReadableStream({
        start(controller) {
          push = (event, data) => controller.enqueue(encoder.encode(frame(event, data)));
          push('tool_use', [
            { id: 'approval-tool', name: 'workspace_agent', input: { command: 'npm test' } },
          ]);
          window.__requestToolApproval = () =>
            push('tool_approval', {
              id: 'approval-tool',
              runId: 'run-approval',
              approvalId: 'approval-123',
              kind: 'commandExecution',
              command: 'npm test',
              cwd: '/workspace',
              reason: 'Validate the project',
              status: 'pending',
              availableDecisions: ['accept', 'decline'],
            });
        },
      });
      return Promise.resolve(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );
    };
  });
  await mockAuthedApp(page);
  await page.addInitScript(() => localStorage.setItem('socrates-lang-app', 'en'));
  const decisions = [];
  await page.route(
    /\/api\/(?:v2\/)?agent-runs\/run-approval\/approvals\/approval-123(?:\?.*)?$/,
    async (route) => {
      decisions.push({ method: route.request().method(), body: route.request().postDataJSON() });
      await route.fulfill({ json: { ok: true } });
    },
  );
  await page.route(/\/api\/(?:v2\/)?agent-runs\/run-approval(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          run: { status: 'completed', summary: 'Command approved and completed.' },
          artifacts: [],
        },
      });
    } else {
      await route.fallback();
    }
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    const sessionId = '66666666-6666-4666-8666-666666666666';
    window.__socratesTestState.patch({ session: { phase: 'chat' } });
    window.__socratesTestState.patch({ session: { currentSessionId: sessionId } });
    window.__socratesTestState.patch({
      session: {
        messages: [
          { clientId: 'user-approval', role: 'user', rawText: 'Run the tests', html: null },
        ],
      },
    });
    window.__testActivateMainView('chatView');
    window.__approvalTurnPromise = window.askChatTurn('Run the tests');
  });

  const row = page
    .locator('.msg.assistant')
    .last()
    .locator('.rn-tool-row[data-tcid="approval-tool"]');
  await expect(row).toHaveAttribute('data-state', 'running');
  await page.evaluate(() => window.__requestToolApproval());
  const prompt = page.locator('.rn-tool-approval');
  await expect(row).toHaveAttribute('data-state', 'awaiting');
  await expect(row.getByTestId('thinking-step-status')).toHaveText('Waiting for your decision');
  await expect(page.getByTestId('turn-activity-indicator')).toHaveCount(0);
  await expect(row.getByTestId('thinking-step-spinner')).toHaveCount(0);
  await expect(prompt).toBeVisible();
  await expect(prompt).toHaveAttribute('role', 'region');
  await expect(prompt.locator('.tool-approval-facts')).toBeVisible();
  await expect(prompt.locator('.tool-approval-decisions')).toBeVisible();
  await expect(page.getByTestId('tool-detail')).toHaveCount(0);
  await expect(prompt.getByRole('button', { name: 'Allow once' })).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Decline' })).toBeVisible();
  await expect(prompt.locator('[data-approval-action="acceptForSession"]')).toHaveCount(0);
  await expect(prompt.locator('[data-approval-action="stop"]')).toHaveCount(0);

  await prompt.locator('[data-approval-action="accept"]').click();
  await expect(prompt.getByTestId('tool-approval-status')).toHaveText('Approved');
  await expect(prompt.locator('.tool-approval-decisions')).toHaveCount(0);
  expect(decisions).toEqual([{ method: 'POST', body: { decision: 'accept' } }]);
});


test('activity bursts start collapsed including failed and unknown rows', async ({ page }) => {
  const body = await loadFixtureSession(page, { expandBursts: false });
  const burst = body.locator('[data-testid=\"turn-activity-toggle\"]').last();
  await expect(burst).toHaveAttribute('aria-expanded', 'false');
  await expect(body.getByTestId('tool-row-w1')).toBeHidden();
  await expect(body.getByTestId('tool-row-f1')).toBeHidden();
  await expect(body.getByTestId('tool-row-f1')).not.toHaveAttribute('aria-expanded', /.+/);
  await expect(body.getByTestId('tool-row-s3')).toBeHidden();
  await burst.focus();
  await page.keyboard.press('Enter');
  await expect(body.getByTestId('tool-row-w1')).toBeVisible();
  const disclosure = body.locator('.activity-disclosure').last();
  await expect(disclosure).toHaveCSS('visibility', 'visible');
  await expect(disclosure).not.toHaveAttribute('inert', '');
  await burst.click();
  await expect(disclosure).toHaveAttribute('inert', '');
  await expect(body.getByTestId('tool-row-w1')).toBeHidden();
  await expect(disclosure).toHaveCSS('visibility', 'hidden');
});
