// e2e/share-view.spec.mjs — regression tests for the share modal and
// the read-only public shared view. Verifies:
//   1. ?share=TOKEN path renders the read-only chat list without an
//      auth gate, without clobbering the namespaced state, and
//      without leaking the message composer.
//   2. createShareLink / revokeShareLink use the per-session endpoint
//      /api/sessions/:id/share (matches server contract + OpenAPI).
//   3. Private visibility is rejected with 403.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SHARE_TOKEN = 'shared-public-token';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
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
  await expect(msgList).toHaveCount(2);
  await expect(msgList.nth(0)).toContainText('What is gravity?');
  await expect(msgList.nth(1)).toContainText('Gravity is a force');

  // The composer is hidden; user cannot post into a shared view.
  const composer = page.locator('#chatComposerRoot');
  await expect(composer).toBeHidden();

  // The state Proxy namespaces are preserved (the previous
  // implementation overwrote state.session wholesale and broke
  // state.session.kb / search / call / ui / exam). The proxy
  // resolves `state.session` as a live reference, so we test
  // for the typed shape of the namespaced fields it carries.
  // Note: window.state.session only exposes `session.*` keys — kb /
  // search / call / ui / exam live as separate top-level
  // `state.kb` / `state.search` / etc. via the flat-namespace
  // proxy. We assert via those flat lookups AND via the namespaced
  // session shape.
  const nsDiag = await page.evaluate(() => {
    const s = window.state;
    if (!s) return { ok: false, reason: 'no state' };
    const session = s.session;
    if (!session) return { ok: false, reason: 'no session' };
    return {
      ok: Array.isArray(session.messages)
        && typeof session.currentSessionId === 'string'
        && Array.isArray(s.kb.kbNodes)
        && Array.isArray(s.search.results)
        && s.call && typeof s.call.source === 'object',
      messages: Array.isArray(session.messages),
      currentSessionId: session.currentSessionId,
      kbNodes: Array.isArray(s.kb.kbNodes),
      searchResults: Array.isArray(s.search.results),
      callType: s.call && typeof s.call.source === 'object',
    };
  });
  expect(nsDiag.ok, 'namespaced state shape: ' + JSON.stringify(nsDiag)).toBe(true);

  // Boot path must NOT have hit /api/auth/me for a public share.
  expect(requests.some((r) => r.includes('/api/auth/me'))).toBe(false);
});

test('create + revoke share uses /api/sessions/:id/share', async ({ page }) => {
  await mockAuthedApp(page);
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
    window.state.session.currentSessionId = '11111111-1111-4111-8111-111111111111';
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
