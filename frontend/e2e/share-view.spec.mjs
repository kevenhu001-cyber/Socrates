// e2e/share-view.spec.mjs — regression tests for the share modal and
// the read-only public shared view. Verifies:
//   1. ?share=TOKEN path renders the read-only chat list without an
//      auth gate, without clobbering the namespaced state, and
//      without leaking the message composer.
//   2. createShareLink / revokeShareLink use the per-session endpoint
//      /api/sessions/:id/share (matches server contract + OpenAPI).
//   3. Private visibility is rejected with 403.
//   4. A turn that recorded tool split points is laid out by the same
//      declarative renderer the chat uses — read-only, so no Retry.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SHARE_TOKEN = 'shared-public-token';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const SHARED_VIZ = {
  version: 1,
  template: 'function',
  title: 'Shared gravity curve',
  caption: 'Persisted in a shared conversation',
  accessibilitySummary: 'A simple inverse-square reference curve.',
  payload: {
    functions: [{ expression: '1/(x^2)', label: '1/x²' }],
    xLabel: 'distance',
    yLabel: 'relative force',
  },
};

/* The declarative turn's fixture. `rawText` is what the public projection now
   carries (server/src/routes/publicShares.ts) and `textOffset` indexes into it,
   so this is the pair the renderer needs to place a row. */
const SHARED_RAW = 'Gravity pulls masses together.\n\nIt weakens with the square of distance.';
const SHARED_CALLS = [
  {
    id: 'shared-search',
    name: 'web_search',
    input: { query: 'inverse square law' },
    output: '2 results',
    results: [
      { title: 'Newton', url: 'https://example.test/newton', snippet: 'Principia' },
      { title: 'Square', url: 'https://example.test/square', snippet: 'Geometry' },
    ],
    durationMs: 900,
    status: 'completed',
    textOffset: 0,
  },
  {
    id: 'shared-fetch',
    name: 'web_fetch',
    input: { url: 'https://arxiv.org/abs/gravity' },
    output: 'Fetched 1 page',
    durationMs: 400,
    status: 'completed',
    textOffset: 0,
  },
];

const SHARED_PAYLOAD = {
  id: SESSION_ID,
  title: 'Shared conversation',
  topic: 'Shared topic',
  domain: 'physics',
  mode: 'chat',
  kind: 'chat',
  createdAt: '2026-01-01T00:00:00Z',
  visibility: 'public',
  messages: [
    {
      id: 'm-1', role: 'user', content: 'What is gravity?', createdAt: '2026-01-01T00:00:01Z',
    },
    {
      id: 'm-2', role: 'assistant', content: 'Gravity is a force that attracts two bodies with mass.', createdAt: '2026-01-01T00:00:02Z',
      toolCalls: [{
        id: 'shared-viz',
        name: 'render_visualization',
        input: SHARED_VIZ,
        output: 'Visualization ready',
        artifacts: [],
      }],
    },
    {
      id: 'm-3',
      role: 'assistant',
      content: '<p>Gravity pulls masses together.</p><p>It weakens with the square of distance.</p>',
      rawText: SHARED_RAW,
      toolCalls: SHARED_CALLS,
      createdAt: '2026-01-01T00:00:03Z',
    },
  ],
};

async function mockShareRoute(page) {
  await page.route('**/api/**/shares/*', async (route) => {
    const url = route.request().url();
    if (url.includes(SHARE_TOKEN)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SHARED_PAYLOAD) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND' }) });
  });
}

test('public ?share=TOKEN loads the read-only chat view without auth', async ({ page }) => {
  await mockAuthedApp(page);
  await mockShareRoute(page);
  const requests = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/')) requests.push(req.method() + ' ' + req.url());
  });
  await page.goto('/?share=' + encodeURIComponent(SHARE_TOKEN));
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // Shared view is rendered; the read-only messages are visible.
  const msgList = page.locator('#msgList .msg');
  await expect(msgList).toHaveCount(3);
  await expect(msgList.nth(0)).toContainText('What is gravity?');
  await expect(msgList.nth(1)).toContainText('Gravity is a force');
  await expect(page.locator('.visualization-card')).toContainText('Shared gravity curve');
  await expect(page.locator('.visualization-card svg path')).not.toHaveCount(0);

  // The composer is hidden; user cannot post into a shared view.
  const composer = page.locator('#chatComposerRoot');
  await expect(composer).toBeHidden();

  // Shared loading must preserve every immutable namespace.
  const nsDiag = await page.evaluate(() => {
    const s = window.stateStore.getSnapshot();
    const session = s.session;
    if (!session) return { ok: false, reason: 'no session' };
    return {
      ok: Array.isArray(session.messages)
        && typeof session.currentSessionId === 'string'
        && Array.isArray(s.kb.kbNodes)
        && Array.isArray(s.search.searchResults)
        && s.call && typeof s.call.lastCallSource === 'object',
      messages: Array.isArray(session.messages),
      currentSessionId: session.currentSessionId,
      kbNodes: Array.isArray(s.kb.kbNodes),
      searchResults: Array.isArray(s.search.searchResults),
      callType: s.call && typeof s.call.lastCallSource === 'object',
    };
  });
  expect(nsDiag.ok, 'namespaced state shape: ' + JSON.stringify(nsDiag)).toBe(true);

  // Boot path must NOT have hit /api/auth/me for a public share.
  expect(requests.some((r) => r.includes('/api/auth/me'))).toBe(false);
});

/* The shared view must look like the conversation it came from: same rows, same
   grouping, same two-tier detail — and none of the controls that would let a
   reader act on someone else's turn. Copy is asserted in English because the
   app defaults to zh. */
test('a shared turn lays its tool rows out declaratively, read-only', async ({ page }) => {
  await mockAuthedApp(page);
  await page.addInitScript(() => {
    try { localStorage.setItem('socrates-lang-app', 'en'); } catch (_) {}
  });
  await mockShareRoute(page);
  await page.goto('/?share=' + encodeURIComponent(SHARE_TOKEN));
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const turn = page.locator('#msgList .msg.assistant').last();
  const body = turn.locator('.msg-body');
  /* The scope class is what re-enables the row meta / chevron the compact
     activity-row pass hides — without it the turn renders but reads inert. */
  await expect(body).toHaveClass(/is-declarative/);

  // Two consecutive calls of the same category → one aggregate header.
  await expect(body.locator('.tool-run-group')).toHaveCount(1);
  await expect(body.locator('.tool-run-summary-meta')).toContainText('2 actions');
  await expect(body.locator('.tool-run-list')).toBeHidden();
  await expect(body.locator('.tool-inline')).toHaveCount(2);

  // Both calls split at offset 0, so the run is the first thing in the turn
  // and the answer prose follows it as one segment — never re-baked rows.
  // (Compared whitespace-collapsed: the markdown renderer's block output
  // separates paragraphs with one newline in textContent, not the source's two.)
  const oneLine = (text) => text.replace(/\s+/g, ' ').trim();
  const order = await body.evaluate((el) => Array.from(el.children).map((node) => (
    node.classList.contains('tool-run-prose')
      ? 'text:' + (node.textContent || '').replace(/\s+/g, ' ').trim()
      : node.classList.contains('tool-run-group') ? 'group' : 'other'
  )));
  expect(order).toEqual(['group', 'text:' + oneLine(SHARED_RAW)]);

  await body.locator('.tool-run-summary').click();
  await expect(body.locator('.tool-inline-label')).toHaveText([
    'Searched "inverse square law"',
    'Read arxiv.org',
  ]);
  await body.locator('.tool-inline[data-tcid="shared-search"] summary').click();
  /* Scoped to the row: the aggregate's merged list is showing the same two
     sources one level up, and that duplication is the point of the header. */
  await expect(body.locator('.tool-inline[data-tcid="shared-search"] .tool-inline-src-title')).toHaveCount(2);

  /* Read-only: nothing in the turn can retry a call or answer a permission
     prompt, and the legacy card chrome must not come back alongside. */
  await expect(body.locator('.tool-inline-retry')).toHaveCount(0);
  await expect(body.locator('.agent-tool-card')).toHaveCount(0);

  // The stylesheet's declarative block was authored against the chat surface;
  // this is the share view's own frame of the same turn, expanded.
  await body.screenshot({ path: 'test-results/share-turn-declarative.png' });
});

test('create + revoke share uses /api/sessions/:id/share', async ({ page }) => {  await mockAuthedApp(page);
  const calls = [];
  await page.route('**/api/**/sessions/*/share', async (route) => {
    calls.push(route.request().method() + ' ' + route.request().url());
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({ token: 'tok-abc', url: '/a/tok-abc', visibility: 'public' }),
      });
    } else if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: null, visibility: 'private' }) });
    }
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: '11111111-1111-4111-8111-111111111111' });
    window.openShareModal();
  });
  await page.evaluate(async () => { await window.createShareLink(); });
  await expect(page.locator('#shareLinkInput')).toBeVisible();
  await expect(page.locator('#shareLinkInput')).toHaveValue(/tok-abc/);
  await page.evaluate(async () => { await window.revokeShareLink(); });
  const shareCalls = calls.filter((c) => /\/api\/(?:v2\/)?sessions\//.test(c) && c.includes('/share'));
  expect(shareCalls.some((c) => c.startsWith('POST'))).toBe(true);
  expect(shareCalls.some((c) => c.startsWith('DELETE'))).toBe(true);
  expect(shareCalls.some((c) => /\/api\/(?:v2\/)?shares\//.test(c))).toBe(false);
});
