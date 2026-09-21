// e2e/tool-output-lifecycle.spec.mjs — tool OUTPUT visibility and lifecycle.
//
// The tool-run specs cover rows and prose order; the visualization specs cover
// a single chart. This file covers the seam the two never met: a chart or file
// that belongs to a call inside a multi-call run. The run's open/closed state
// may hide arguments and stdout, but never an output — and history restore must
// land in the same host React already rendered instead of mounting a twin.
//
// Fixtures put the calls at the same textOffset so they fold into ONE run:
// `showsHeader` needs two settled members, which is exactly the state that used
// to move attachments inside `.tool-run-list[hidden]`.
//
// Charts are observed by e2e/_viz-probe.mjs (a MutationObserver over
// `.visualization-card`) where mount counts matter; the invalid-spec and
// mobile-overflow cases use the real renderer too, but assert layout.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { installVizProbe, readVizProbe } from './_viz-probe.mjs';

const SESSION_ID = '66666666-6666-4666-8666-666666666666';
const RAW = 'Lead paragraph.';

/* 1×1 transparent PNG for the artifact route. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

function vizSpec(title) {
  return {
    version: 1,
    template: 'function',
    title,
    caption: 'A probe chart',
    accessibilitySummary: 'The graph of y equals x squared.',
    payload: {
      functions: [{ expression: 'x^2', label: 'y = x²' }],
      xLabel: 'x',
      yLabel: 'y',
    },
  };
}

const BAD_SPEC = {
  version: 1,
  template: 'pie',
  title: 'Broken pie',
  caption: 'Missing series',
  accessibilitySummary: 'A pie with no data.',
  payload: { categories: [], series: null },
};

const SEARCH_RESULTS = [
  { title: 'Alpha', url: 'https://example.test/alpha' },
  { title: 'Beta', url: 'https://example.test/beta' },
];

function searchCall(id, query) {
  return {
    id,
    name: 'web_search',
    input: { query },
    output: '2 results',
    results: SEARCH_RESULTS,
    durationMs: 900,
    status: 'completed',
    textOffset: 0,
  };
}

function vizCall(id, title) {
  const spec = vizSpec(title);
  return {
    id,
    name: 'render_visualization',
    input: spec,
    output: 'Visualization ready',
    visualization: spec,
    durationMs: 400,
    status: 'completed',
    textOffset: 0,
  };
}

function userMessage() {
  return { id: 'lifecycle-user', role: 'user', rawText: 'Draw it', html: '<p>Draw it</p>' };
}

function assistantMessage(toolCalls, rawText = RAW) {
  return {
    id: 'lifecycle-assistant',
    role: 'assistant',
    rawText,
    // Deliberately stale: the declarative renderer must never read this.
    html: '<p>stale snapshot</p>',
    toolCalls,
  };
}

/**
 * Boot the mocked app, stub the artifact endpoint and the session read, then
 * load a fixture through the real `loadSession`. The probe (when enabled) is
 * installed before the messages land so every mount is recorded.
 */
async function openAssistantFixture(page, messages, options = {}) {
  const sessionId = options.sessionId || SESSION_ID;
  await mockAuthedApp(page);
  await page.route('**/api/files/**', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: PNG_1PX,
  }));
  await page.route(
    new RegExp('/api/(?:v2/)?sessions/' + sessionId + '(?:\\?.*)?$'),
    (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: sessionId,
        topic: 'Tool output lifecycle',
        title: 'Tool output lifecycle',
        domain: 'math',
        mode: 'chat',
        kind: 'chat',
        phase: 'chat',
        messages,
        kbNodes: [],
        mistakes: [],
      }),
    }),
  );
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  if (options.probe !== false) await installVizProbe(page);
  await page.waitForFunction(() => typeof window.loadSession === 'function', null, { timeout: 15_000 });
  await page.evaluate((id) => window.loadSession(id), sessionId);
  return page.locator('#msgList .msg.assistant').last().locator('.msg-body');
}

/* ── visibility under a collapsed run ─────────────────────────────────── */

test('a settled visualization under a collapsed tool run stays on screen', async ({ page }) => {
  const body = await openAssistantFixture(page, [
    userMessage(),
    assistantMessage([searchCall('search-1', 'parabola'), vizCall('viz-1', 'Probe parabola')]),
  ]);

  const group = body.locator('.tool-run-group');
  await expect(group).toHaveCount(1);
  await expect(group.locator('.tool-run-summary')).toHaveCount(1);
  await expect(group.locator('.tool-run-list')).toHaveAttribute('hidden', '');

  const card = body.locator('.visualization-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Probe parabola');
  // The chart is not buried inside the collapsed state panel (nor inside the
  // section whose shape changes as members settle).
  await expect(group.locator('.visualization-card')).toHaveCount(0);
  await expect(group.locator('.tool-run-list .visualization-card')).toHaveCount(0);

  const probe = await readVizProbe(page);
  expect(probe.created.map((m) => m.cardId)).toEqual(['viz-1']);
  expect(probe.created[0].hostConnected).toBe(true);
  expect(probe.removed).toEqual([]);

  /* Visual contract: the collapsed run shows its chart below the summary. */
  await group.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await body.screenshot({ path: 'test-results/tool-output-collapsed.png' });
});

test('opening the mobile tool sheet does not move or duplicate call outputs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const code = {
    id: 'code-1',
    name: 'code_interpreter',
    input: { code: 'plot(x, y)' },
    output: 'saved plot.png',
    artifacts: [{ id: 'file-1', mimeType: 'image/png', name: 'plot.png' }],
    durationMs: 500,
    status: 'completed',
    textOffset: 0,
  };
  const body = await openAssistantFixture(page, [
    userMessage(),
    assistantMessage([
      searchCall('search-1', 'curve'),
      vizCall('viz-a', 'Probe A'),
      code,
      vizCall('viz-b', 'Probe B'),
    ]),
  ]);

  const group = body.locator('.tool-run-group');
  const sheet = page.locator('[data-tool-run-sheet="1"]');
  const charts = body.locator('.visualization-card');
  await expect(charts).toHaveCount(2);
  await expect(charts.nth(0)).toContainText('Probe A');
  await expect(charts.nth(1)).toContainText('Probe B');
  await expect(body.locator('.exec-artifact')).toHaveCount(0);
  await expect(group.locator('.tool-run-list')).toHaveAttribute('hidden', '');

  await group.locator('.tool-run-summary').click();
  await expect(sheet).toBeVisible();
  await expect(charts).toHaveCount(2);
  await expect(body.locator('.exec-artifact')).toHaveCount(0);
  await expect(sheet.locator('.visualization-card, .exec-artifact')).toHaveCount(0);
  const codeRow = sheet.locator('.tool-inline[data-tool="code_interpreter"]');
  await codeRow.locator('summary').click();
  await expect(codeRow.locator('.tool-inline-artifact-row')).toContainText('plot.png');
  await expect(codeRow.locator('.tool-inline-artifact-actions a')).toHaveCount(2);
  await expect(group.locator('.tool-run-list .visualization-card, .tool-run-list .exec-artifact')).toHaveCount(0);

  const probe = await readVizProbe(page);
  expect(probe.created.map((mount) => mount.cardId)).toEqual(['viz-a', 'viz-b']);
  expect(probe.removed).toEqual([]);
});

test('a referenced code artifact renders at its prose directive while native visualization stays automatic', async ({ page }) => {
  const code = {
    id: 'code-1',
    name: 'code_interpreter',
    input: { code: 'plt.plot(x, y)' },
    output: 'saved plot.png',
    artifacts: [{ id: 'file-1', mimeType: 'image/png', name: 'plot.png' }],
    durationMs: 1200,
    status: 'completed',
    textOffset: 0,
  };
  const body = await openAssistantFixture(page, [
    userMessage(),
    assistantMessage(
      [code, vizCall('viz-1', 'Probe scatter')],
      'Lead paragraph.\n\n{{artifact:file-1}}\n\nTail paragraph.',
    ),
  ]);

  const group = body.locator('.tool-run-group');
  await expect(group.locator('.tool-run-list')).toHaveAttribute('hidden', '');
  await expect(body.locator('.visualization-card')).toBeVisible();
  await expect(body.locator('.exec-artifact-image')).toBeVisible();
  await expect(body).not.toContainText('{{artifact:');
  const directiveOrder = await body.evaluate((root) => {
    const lead = Array.from(root.querySelectorAll('.tool-run-prose')).find((node) => node.textContent.includes('Lead paragraph'));
    const tail = Array.from(root.querySelectorAll('.tool-run-prose')).find((node) => node.textContent.includes('Tail paragraph'));
    const artifact = root.querySelector('.tool-inline-attachments[data-tool-anchor*="ref"]');
    if (!lead || !tail || !artifact) return false;
    return Boolean(
      lead.compareDocumentPosition(artifact) & Node.DOCUMENT_POSITION_FOLLOWING
      && artifact.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
  expect(directiveOrder).toBe(true);
  await expect(group.locator('.visualization-card')).toHaveCount(0);
  await expect(group.locator('.exec-artifact')).toHaveCount(0);
  await expect(group.locator('.tool-run-list .visualization-card')).toHaveCount(0);
  await expect(group.locator('.tool-run-list .exec-artifact')).toHaveCount(0);
});

test('two visualizations in one run mount once each, in call order', async ({ page }) => {
  const body = await openAssistantFixture(page, [
    userMessage(),
    assistantMessage([vizCall('viz-a', 'Probe A'), vizCall('viz-b', 'Probe B')]),
  ]);

  const cards = body.locator('.visualization-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Probe A');
  await expect(cards.nth(1)).toContainText('Probe B');
  await expect(body.locator('.tool-run-list .visualization-card')).toHaveCount(0);

  const probe = await readVizProbe(page);
  expect(probe.created.map((m) => m.cardId)).toEqual(['viz-a', 'viz-b']);
  expect(probe.removed).toEqual([]);
});

/* ── live transition ──────────────────────────────────────────────────── */

test('a visualization stays visible across the running → result transition', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    let push = null;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (!url.includes('/chat/stream')) return nativeFetch(input, init);
      const stream = new ReadableStream({
        start(controller) {
          push = (text) => controller.enqueue(encoder.encode(text));
          window.__outPushFrame = (event, data) => push(frame(event, data));
          window.__outText = (content) => push('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n');
          window.__outFinish = () => { push('data: [DONE]\n\n'); controller.close(); };
        },
      });
      return Promise.resolve(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  });
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await installVizProbe(page);
  await page.evaluate(() => {
    const sessionId = '77777777-7777-4777-8777-777777777777';
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: sessionId });
    window.stateStore.dispatch({
      type: 'state/set',
      key: 'messages',
      value: [{ clientId: 'lifecycle-live-user', role: 'user', rawText: 'Run both', html: null }],
    });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.__turnPromise = window.askChatTurn('Run both');
  });
  await page.waitForFunction(() => typeof window.__outPushFrame === 'function', null, { timeout: 15_000 });

  await page.evaluate(() => window.__outPushFrame('tool_use', [
    { id: 'search-1', name: 'web_search', input: { query: 'parabola' } },
  ]));
  await page.evaluate((results) => window.__outPushFrame('tool_result', {
    id: 'search-1',
    ok: true,
    status: 'completed',
    output: '2 results',
    results,
    durationMs: 100,
  }), SEARCH_RESULTS);

  /* The chart mounts while its call is still in flight (the spec is already
     in the arguments) and must not vanish when the result lands. */
  const spec = vizSpec('Probe transition');
  await page.evaluate((input) => window.__outPushFrame('tool_use', [
    { id: 'viz-1', name: 'render_visualization', input },
  ]), spec);
  const message = page.locator('.msg.assistant').last();
  const card = message.locator('.visualization-card').last();
  await expect(card).toBeVisible();
  await expect(card).toContainText('Probe transition');

  await page.evaluate((visualization) => window.__outPushFrame('tool_result', {
    id: 'viz-1',
    ok: true,
    status: 'completed',
    output: 'Visualization ready',
    visualization,
    durationMs: 100,
  }), spec);

  await expect(message.locator('.tool-inline[data-tcid="viz-1"]')).toHaveAttribute('data-state', 'done');
  const group = message.locator('.tool-run-group');
  await expect(group).toHaveCount(1);
  await expect(group.locator('.tool-run-summary')).toHaveCount(1);
  await expect(group.locator('.tool-run-list')).toHaveAttribute('hidden', '');
  await expect(message.locator('.visualization-card')).toBeVisible();
  await expect(group.locator('.visualization-card')).toHaveCount(0);
  await expect(group.locator('.tool-run-list .visualization-card')).toHaveCount(0);
  await expect(message.locator('.visualization-card')).toHaveCount(1);

  /* The settle must not have torn the running renderer down and rebuilt it:
     the host survives the single-member → aggregate shape change, and the
     content-stable spec identity keeps the effect from re-running. */
  const probe = await readVizProbe(page);
  expect(probe.created.map((m) => m.cardId)).toEqual(['viz-1']);
  expect(probe.removed).toEqual([]);
  expect(probe.disposeCalls).toEqual([]);

  await page.evaluate(() => { window.__outText('All done.'); window.__outFinish(); });
});

/* ── stability and history ────────────────────────────────────────────── */

test('expanding and collapsing a run ten times never remounts its chart', async ({ page }) => {
  const body = await openAssistantFixture(page, [
    userMessage(),
    assistantMessage([searchCall('search-1', 'parabola'), vizCall('viz-1', 'Probe stable')]),
  ]);
  const card = body.locator('.visualization-card');
  await expect(card).toBeVisible();
  const handle = await card.elementHandle();

  const list = body.locator('.tool-run-list');
  const summary = body.locator('.tool-run-summary');
  for (let i = 0; i < 10; i++) {
    await summary.click();
    if (i % 2 === 0) await expect(list).not.toHaveAttribute('hidden', '');
    else await expect(list).toHaveAttribute('hidden', '');
  }

  const sameNode = await page.evaluate((el) => {
    const now = document.querySelector('.visualization-card[data-visualization-id="viz-1"]');
    return !!now && now === el && now.isConnected;
  }, handle);
  expect(sameNode).toBe(true);

  const probe = await readVizProbe(page);
  expect(probe.created).toHaveLength(1);
  expect(probe.removed).toEqual([]);
  expect(probe.disposeCalls).toEqual([]);
});

test('history restore reuses the declarative host instead of mounting a second card', async ({ page }) => {
  const body = await openAssistantFixture(page, [
    userMessage(),
    assistantMessage([searchCall('search-1', 'parabola'), vizCall('viz-1', 'Probe restored')]),
  ]);

  await expect(body.locator('.tool-inline[data-tcid="search-1"]')).toHaveAttribute('data-state', 'done');
  await expect(body.locator('.tool-inline[data-tcid="viz-1"]')).toHaveAttribute('data-state', 'done');
  await expect(body.locator('.visualization-card')).toHaveCount(1);
  await expect(body.locator('.tool-inline-attachments')).toHaveCount(1);
  await expect(body.locator('.agent-tool-card')).toHaveCount(0);

  const probe = await readVizProbe(page);
  expect(probe.created).toHaveLength(1);
  expect(probe.removed).toEqual([]);
  expect(probe.disposeCalls).toEqual([]);
});

test('a call persisted with the outputs protocol renders the same', async ({ page }) => {
  /* The writer will eventually persist `outputs[]` instead of the legacy
     `visualization` / `artifacts` fields. Inputs stay legacy-free on purpose
     so only the protocol path can produce the card. */
  const protocolSpec = vizSpec('Probe protocol');
  const code = {
    id: 'code-proto',
    name: 'code_interpreter',
    input: { code: 'plot()' },
    output: 'saved',
    durationMs: 10,
    status: 'completed',
    textOffset: 0,
    outputs: [
      { kind: 'artifact', fileId: 'file-proto', mimeType: 'image/png', name: 'proto.png' },
      { kind: 'text', stream: 'stdout', text: 'done' },
    ],
  };
  const viz = {
    id: 'viz-proto',
    name: 'render_visualization',
    input: { note: 'protocol only' },
    output: 'Visualization ready',
    durationMs: 10,
    status: 'completed',
    textOffset: 0,
    outputs: [{ kind: 'visualization', spec: protocolSpec }],
  };
  const body = await openAssistantFixture(page, [
    userMessage(),
    assistantMessage([code, viz], 'Lead paragraph.\n\n{{artifact:file-proto}}'),
  ]);

  const card = body.locator('.visualization-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Probe protocol');
  await expect(body.locator('.exec-artifact-image')).toBeVisible();

  const probe = await readVizProbe(page);
  expect(probe.created.map((m) => m.cardId)).toEqual(['viz-proto']);
});

/* ── real renderer cases ──────────────────────────────────────────────── */

test('a collapsed run with a real chart does not overflow a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const body = await openAssistantFixture(page, [
    userMessage(),
    assistantMessage([searchCall('search-1', 'parabola'), vizCall('viz-1', 'Real parabola')]),
  ], { probe: false });

  const card = body.locator('.visualization-card');
  await expect(card).toBeVisible();
  await expect(card.locator('svg path')).not.toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test('a broken spec falls back alone and does not take the turn down', async ({ page }) => {
  const bad = {
    id: 'bad-viz',
    name: 'render_visualization',
    input: BAD_SPEC,
    output: 'Visualization ready',
    visualization: BAD_SPEC,
    durationMs: 10,
    status: 'completed',
    textOffset: 0,
  };
  const body = await openAssistantFixture(page, [
    userMessage(),
    assistantMessage([bad, vizCall('viz-good', 'Probe good')]),
  ], { probe: false });

  await expect(body.locator('.visualization-card')).toHaveCount(2);
  await expect(body.locator('.visualization-fallback')).toHaveCount(1);
  const good = body.locator('.visualization-card').filter({ hasText: 'Probe good' });
  await expect(good).toBeVisible();
  await expect(good.locator('svg path')).not.toHaveCount(0);
  await expect(body.locator('.tool-run-prose')).toContainText('Lead paragraph.');
});

/* ── teardown and renderer retry ──────────────────────────────────────── */

const SECOND_SESSION_ID = '99999999-9999-4999-8999-999999999999';

test('switching sessions disposes the mounted renderer', async ({ page }) => {
  const body = await openAssistantFixture(page, [
    userMessage(),
    assistantMessage([searchCall('search-1', 'parabola'), vizCall('viz-1', 'Probe dispose')]),
  ]);
  await expect(body.locator('.visualization-card')).toHaveCount(1);

  await page.route(
    new RegExp('/api/(?:v2/)?sessions/' + SECOND_SESSION_ID + '(?:\\?.*)?$'),
    (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: SECOND_SESSION_ID,
        topic: 'Empty',
        title: 'Empty',
        domain: 'math',
        mode: 'chat',
        kind: 'chat',
        phase: 'chat',
        messages: [],
        kbNodes: [],
        mistakes: [],
      }),
    }),
  );
  await page.evaluate((id) => window.loadSession(id), SECOND_SESSION_ID);

  await expect(page.locator('#msgList .visualization-card')).toHaveCount(0);
  await expect.poll(async () => {
    const probe = await readVizProbe(page);
    return probe.disposedCards.some((card) => card.cardId === 'viz-1')
      || probe.disposeCalls.some((call) => call.cardIds.includes('viz-1'));
  }).toBe(true);
});

test('a failed GeoGebra load is retried locally instead of replaying the rejection', async ({ page }) => {
  let scriptRequests = 0;
  await page.route('**/deployggb.js', (route) => {
    scriptRequests += 1;
    return route.abort();
  });
  const geoSpec = {
    version: 1,
    template: 'math_construction',
    title: 'Geo probe',
    caption: 'A construction',
    accessibilitySummary: 'A right triangle construction.',
    payload: { appName: 'geometry', commands: ['A=(0,0)', 'B=(2,0)'] },
  };
  const geo = {
    id: 'geo-1',
    name: 'render_visualization',
    input: geoSpec,
    output: 'Visualization ready',
    visualization: geoSpec,
    durationMs: 10,
    status: 'completed',
    textOffset: 0,
  };
  const body = await openAssistantFixture(page, [
    userMessage(),
    assistantMessage([geo]),
  ], { probe: false });

  const fallback = body.locator('.visualization-fallback');
  await expect(fallback).toBeVisible();
  expect(scriptRequests).toBe(1);

  /* The card's own Retry must re-request the CDN script. Before the cache
     reset it replayed the cached rejection, so the request count stayed 1
     and the button could never recover. */
  await fallback.locator('button').click();
  await expect.poll(() => scriptRequests, { timeout: 10_000 }).toBe(2);
  await expect(body.locator('.visualization-fallback')).toBeVisible();
});
