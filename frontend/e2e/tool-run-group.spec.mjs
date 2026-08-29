// e2e/tool-run-group.spec.mjs — the declarative tool-run renderer (react/tool-run).
//
// Both surfaces draw from the same data now: a streamed turn and a restored one
// are laid out from `rawText` + `toolCalls[].textOffset`, so a reload shows what
// the stream showed. Most of these specs therefore load a session fixture, and
// assert the structure the plan calls for:
//
//   1. a run of ≥2 calls collapses under one aggregate header, a run of 1 does
//      not get a header at all;
//   2. an in-flight call renders outside the collapsed header;
//   3. expanding a row shows results, and the argument dump sits behind the
//      secondary 「技术细节」 toggle;
//   4. a failed row keeps a visible chevron + Retry, which re-dispatches the
//      same `tool-retry` event the legacy delegate listens for;
//   5. prose stays in its recorded order around the rows;
//   6. a running row paints its streaming program and stdout OUTSIDE any
//      collapsible (one spec here drives a real SSE for that — history cannot
//      stream).
//
// Copy is asserted in English (the app defaults to zh), so the spec pins the
// language before boot instead of asserting on one locale's word order.

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
    { title: 'Alpha one', url: 'https://example.test/alpha-one', snippet: 'First' },
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
async function loadFixtureSession(page, { theme = 'dark', html = null } = {}) {
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
            toolCalls: FIXTURE_CALLS,
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
  return page.locator('#msgList .msg.assistant').last().locator('.msg-body');
}

test('a run of three searches collapses under one header, with the live row outside it', async ({ page }) => {
  const body = await loadFixtureSession(page);

  await expect(body.locator('.tool-run-group')).toHaveCount(2);
  const first = body.locator('.tool-run-group').first();

  /* While any member is in flight the header says so, and the count of calls
     in the run — finished or not — rides in the meta. */
  await expect(first.locator('.tool-run-summary-label')).toHaveText('Exploring');
  await expect(first.locator('.tool-run-summary-meta')).toContainText('3 actions');
  await expect(first).toHaveAttribute('data-state', 'running');
  await expect(first).toHaveAttribute('data-category', 'search');
  /* The header is a control, so it has to look like one: the chevron sits at the
     right edge of the line. */
  const chev = await first.locator('.tool-run-summary-chev').boundingBox();
  expect(chev.width).toBeGreaterThanOrEqual(12);
  const head = await first.locator('.tool-run-summary').boundingBox();
  expect(chev.x + chev.width).toBeCloseTo(head.x + head.width, -1);

  /* Collapsed by default. The member rows exist (expanding must not have to
     build them) but nothing under the hidden aggregate body is on screen. */
  await expect(first.locator('.tool-run-list')).toHaveAttribute('hidden', '');
  await expect(first.locator('.tool-run-list')).toBeHidden();
  await expect(first.locator('.tool-run-list .tool-inline')).toHaveCount(2);
  await expect(first.locator('.tool-run-list .tool-inline').first()).toBeHidden();

  /* The in-flight third search is the one line that must stay visible. */
  const live = first.locator('.tool-inline[data-tcid="s3"]');
  await expect(live).toHaveCount(1);
  await expect(live).toHaveAttribute('data-state', 'running');
  await expect(live).toBeVisible();
  await expect(live.locator('.tool-inline-label')).toHaveText('Searching "gamma theory"…');
  // Outside the collapsed aggregate, not inside it:
  await expect(first.locator('.tool-run-list .tool-inline[data-tcid="s3"]')).toHaveCount(0);

  await first.locator('.tool-run-summary').click();
  await expect(first.locator('.tool-run-list')).not.toHaveAttribute('hidden', '');
  await expect(first.locator('.tool-run-list .tool-inline')).toHaveCount(2);
  /* Expanding the aggregate gives the merged source list first — the thing a
     reader actually wants — before any per-call row is opened. */
  await expect(first.locator('.tool-run-list > .tool-inline-detail [data-kind="sources"] .tool-inline-src-title'))
    .toHaveCount(3);
  await expect(first.locator('.tool-inline[data-tcid="s1"] .tool-inline-label'))
    .toHaveText('Searched "alpha theory"');
  await expect(first.locator('.tool-inline[data-tcid="s2"] .tool-inline-label'))
    .toHaveText('Searched "beta theory"');
  /* Every nested row is marked so the stylesheet can tighten its rhythm. */
  await expect(first.locator('.tool-run-list .tool-inline[data-tcid="s1"]'))
    .toHaveAttribute('data-nested', '1');
});

test('expanding a row shows the result, and the argument dump sits behind Technical details', async ({ page }) => {
  const body = await loadFixtureSession(page);
  const group = body.locator('.tool-run-group').first();
  await group.locator('.tool-run-summary').click();

  const row = group.locator('.tool-inline[data-tcid="s1"]');
  await row.locator('summary').click();
  await expect(row).toHaveAttribute('open', '');

  const detail = row.locator('.tool-inline-detail');
  await expect(detail.locator('.tool-inline-detail-title').first()).toHaveText('Sources');
  await expect(detail.locator('.tool-inline-src-title')).toHaveCount(2);
  await expect(detail.locator('.tool-inline-src[rel="noopener noreferrer"]')).toHaveCount(2);

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

  await row.locator('summary').click();
  await expect(row.locator('[data-kind="error"] .tool-inline-detail-value'))
    .toContainText('Search upstream timed out after 30s');

  /* Retry must reach the legacy delegate listener as the same CustomEvent. */
  await page.evaluate(() => {
    window.__retryEvents = [];
    document.addEventListener('tool-retry', (event) => {
      window.__retryEvents.push(event.detail);
    });
  });
  await row.locator('.tool-inline-retry').click();
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

test('a write run uses one compact summary row that opens its file details', async ({ page }) => {
  const body = await loadFixtureSession(page);
  const write = body.locator('.tool-run-group').nth(1);
  await expect(write).toHaveAttribute('data-state', 'complete');
  await expect(write.locator('.tool-run-summary-label')).toHaveText('Edited moe.py + router_v2.py');

  await expect(write.locator('.tool-inline-file-summary')).toHaveCount(0);
  await write.locator('.tool-run-summary').click();
  await expect(write.locator('.tool-run-list')).not.toHaveAttribute('hidden', '');
  await expect(write.locator('[data-kind="files"] .tool-inline-detail-value'))
    .toContainText('router_v2.py');
  await expect(write.locator('.tool-inline[data-tcid="w1"] .tool-inline-label'))
    .toHaveText('Created router_v2.py');
});

test('answer prose keeps its recorded order around the rows, with no baked-in duplicates', async ({ page }) => {
  const body = await loadFixtureSession(page);
  const layout = await body.evaluate((el) => {
    const order = [];
    for (const node of Array.from(el.children)) {
      /* Attachment hosts are mount points, not layout: React renders them next
         to a row that has a chart or file, and the history-recovery pass may
         add one for the same call. Neither is part of the answer's flow. */
      if (node.classList.contains('tool-inline-attachments')) continue;
      if (node.classList.contains('tool-run-prose')) {
        order.push(`text:${(node.textContent || '').trim()}`);
      } else if (node.classList.contains('tool-run-group')) {
        order.push(`group:${node.dataset.category}`);
      } else if (node.classList.contains('tool-inline')) {
        order.push(`row:${node.dataset.tcid}`);
      } else {
        order.push(`other:${node.className}`);
      }
    }
    return order;
  });
  expect(layout).toEqual([
    'group:search',
    'text:Lead paragraph.',
    'row:f1',
    'text:Middle paragraph.',
    'group:write',
    'text:Tail paragraph.',
  ]);

  /* The stale html string carried a baked row; drawing from toolCalls[] must
     not leave it behind, and must not duplicate the legacy card chrome. */
  await expect(body.locator('.agent-tool-card')).toHaveCount(0);
  await expect(body.locator('.tool-inline')).toHaveCount(6);
  await expect(body).not.toContainText('baked row');
});

test('the turn keeps one column for its rows and prose at body width', async ({ page }) => {
  /* Collapsed is the state a reader lands in, so capture it before opening
     anything: one header for the run, the live row below it, one lone row, and
     the file chip standing in for the write group's contents.

     No light-mode pair: `body[data-conversation-active] #appShell` pins the
     conversation surface to the dark workbench palette (styles.css "Socrates
     workbench contract"), so a light-theme load of a chat renders identically.
     The `theme` option stays on the fixture so a spec that needs the light
     palette can ask for it elsewhere. */
  const body = await loadFixtureSession(page);
  await expect(body.locator('.tool-run-group')).toHaveCount(2);
  await body.locator('.tool-run-group').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await body.screenshot({ path: 'test-results/tool-run-group-dark.png' });

  await body.locator('.tool-run-group').first().locator('.tool-run-summary').click();
  await body.locator('.tool-inline[data-tcid="s1"] summary').click();
  await page.waitForTimeout(150);
  await body.screenshot({ path: 'test-results/tool-run-group-dark-open.png' });

  /* The live row sits outside the collapsed header, but it is still a member of
     the run: its icon must land in the same column as the settled rows' icons,
     not back at the prose edge. (Checked once the aggregate is open, since a
     collapsed member has no box to measure.) */
  const memberBox = await body.locator('.tool-inline[data-tcid="s2"] .tool-inline-tool-icon').boundingBox();
  const liveBox = await body.locator('.tool-inline[data-tcid="s3"] .tool-inline-tool-icon').boundingBox();
  expect(Math.abs(memberBox.x - liveBox.x)).toBeLessThanOrEqual(1);
  /* And a lone row stays at the prose edge, unindented. */
  const loneBox = await body.locator('.tool-inline[data-tcid="f1"] .tool-inline-tool-icon').boundingBox();
  expect(loneBox.x).toBeLessThan(memberBox.x - 10);

  // Each prose slice is its own element, but display:contents keeps the text
  // flowing as one body: the paragraphs must still be laid out at body width.
  const proseWidth = await body.locator('.tool-run-prose').first().evaluate((el) => {
    const p = el.querySelector('p') || el.firstElementChild;
    return p ? p.getBoundingClientRect().width : 0;
  });
  expect(proseWidth).toBeGreaterThan(200);
});

/* The live preview is the one part of a running call that must not wait for a
   click: a long-running `code_interpreter` is only legible if the program — and
   then its stdout — is on screen while it runs. The old painter built that
   preview and wrote it into the row's collapsed body, where nobody could see
   it. History cannot stream, so this is the one spec in the file that drives a
   real SSE. */
test('a running code call paints its program and stdout outside any collapsible', async ({ page }) => {
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
    window.state.phase = 'chat';
    window.state.currentSessionId = sessionId;
    window.state.session.currentSessionId = sessionId;
    window.state.messages = [{ clientId: 'user-code', role: 'user', rawText: 'Run it', html: null }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.__codeTurnPromise = window.askChatTurn('Run it');
  });

  const row = page.locator('.msg.assistant').last().locator('.tool-inline[data-tcid="live-code"]').last();
  await expect(row).toHaveAttribute('data-state', 'running');

  await page.evaluate(() => window.__streamArgs());
  const preview = row.locator('.tool-inline-code-preview').first();
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('step_39(data)');
  /* Outside every collapsible — the row itself is a plain div while in flight,
     which is the whole point of the live shape. */
  expect(await preview.evaluate((el) => Boolean(el.closest('details')))).toBe(false);

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

  await page.evaluate(() => window.__finishCode());
  await expect(row).toHaveAttribute('data-state', 'done');
  /* A settled row reports results, not the stream it came from: the program now
     sits behind Technical details and the output in the result section. */
  await expect(row.locator('.tool-inline-code-preview')).toHaveCount(0);
});
