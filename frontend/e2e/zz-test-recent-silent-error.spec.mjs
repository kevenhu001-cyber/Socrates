// E2E test for the silent-error Recent list bug:
// When /api/sessions fails (network error, 5xx, ad blocker, proxy, etc.),
// `refreshServerSessions` swallows the error silently, leaving
// SERVER_SESSIONS=[] and showing the misleading "No recent sessions yet."
// message — even though the user has sessions on the server.
//
// This is the root cause of "Recent list empty on some devices":
// devices with network issues, ad blockers, or proxy configurations see
// an empty list with no indication that anything went wrong.
//
// After the fix, the empty state should distinguish "fetch failed" from
// "truly no sessions", surface the error to the user, and offer a retry.
import { test, expect } from '@playwright/test';

test('Recent list surfaces fetch failure instead of misleading "no sessions" message', async ({ page }) => {
  await page.context().addCookies([
    { name: 'sid', value: 'test-sid', domain: '127.0.0.1', path: '/' },
    { name: 'csrf', value: 'test-csrf', domain: '127.0.0.1', path: '/' },
  ]);

  let sessionsFetchCount = 0;

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/api/auth/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'u1', email: 't@t.com', verifiedAt: '2026-01-01' } }) });
      return;
    }
    if (url.includes('/api/config')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasBeagleKey: false }) });
      return;
    }
    if (url.includes('/api/auth/csrf-token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken: 'test-csrf', ok: true }) });
      return;
    }
    if (url.includes('/api/sessions') && method === 'GET') {
      sessionsFetchCount++;
      // Simulate a server-side failure (5xx) — e.g. transient outage,
      // database connection issue, or rate limiting.
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Internal server error' }) });
      return;
    }
    if (url.includes('/api/memories') || url.includes('/api/api-key') || url.includes('/api/usage') || url.includes('/api/projects')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], list: [], count: 0, ok: true, providers: [], activeId: null }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.addInitScript(() => {
    try { localStorage.removeItem('socrates-projects'); } catch (_) {}
    try { localStorage.removeItem('socrates-recents-filter'); } catch (_) {}
  });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500);

  // Switch to recents tab.
  await page.evaluate(() => {
    const tab = document.querySelector('[onclick*="switchTab(\'recents\')"]');
    if (tab) tab.click();
  }).catch(() => {});
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => {
    const list = document.getElementById('recentsList') || {};
    return {
      recentsCount: document.querySelectorAll('#recentsList .recent-item').length,
      recentsHTML: list.innerHTML || '',
      serverSessionsLen: (window.SERVER_SESSIONS || []).length,
      fetchFailedFlag: window.SERVER_SESSIONS_FETCH_FAILED,
      activeProjectFilter: window.state && window.state.session && window.state.session.activeProjectFilter,
      recentsFilter: window.getRecentsFilter && window.getRecentsFilter(),
    };
  });

  console.log('Sessions fetch count:', sessionsFetchCount);
  console.log('SERVER_SESSIONS length:', result.serverSessionsLen);
  console.log('SERVER_SESSIONS_FETCH_FAILED flag:', result.fetchFailedFlag);
  console.log('Recents DOM count:', result.recentsCount);
  console.log('Recents HTML (first 600):', result.recentsHTML.slice(0, 600));

  // The fetch must have been attempted.
  expect(sessionsFetchCount, 'refreshServerSessions should have attempted to fetch /api/sessions').toBeGreaterThan(0);

  // AFTER the fix: the empty state should distinguish "fetch failed" from
  // "truly no sessions". The misleading "No recent sessions yet." message
  // must NOT appear when the fetch failed — the user has sessions on the
  // server, we just couldn't load them.
  expect(
    result.recentsHTML,
    'should NOT show the misleading "No recent sessions yet." message when the fetch failed'
  ).not.toContain('No recent sessions yet');

  // AFTER the fix: an error-aware message should be shown so the user
  // understands their data isn't gone — the load just failed.
  const indicatesFailure = /couldn't|failed|error|try again|retry/i.test(result.recentsHTML);
  expect(indicatesFailure, 'should surface the fetch failure to the user').toBe(true);

  // AFTER the fix: a retry affordance should be present.
  expect(result.recentsHTML.toLowerCase(), 'should offer a retry action').toContain('retry');
});

test('auto-retry recovers sessions when the server comes back after a transient 5xx', async ({ page }) => {
  // This test verifies the auto-retry inside refreshServerSessions: when the
  // first GET /api/sessions returns 500 (transient) but the second succeeds,
  // the user should see their sessions render — no manual Retry needed.
  await page.context().addCookies([
    { name: 'sid', value: 'test-sid', domain: '127.0.0.1', path: '/' },
    { name: 'csrf', value: 'test-csrf', domain: '127.0.0.1', path: '/' },
  ]);

  let sessionsFetchCount = 0;
  const now = Date.now();
  const sessions = [
    { id: 's-recovered-1', userId: 'u1', topic: 'Recovered chat', title: 'Recovered chat', mode: 'chat', phase: 'chat', kind: 'chat', pinned: false, archivedAt: null, totalQ: 0, currentNode: 0, kbNodes: [], mistakes: [], updatedAt: new Date(now).toISOString(), createdAt: new Date(now).toISOString() },
  ];

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/api/auth/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'u1', email: 't@t.com', verifiedAt: '2026-01-01' } }) });
      return;
    }
    if (url.includes('/api/config')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasBeagleKey: false }) });
      return;
    }
    if (url.includes('/api/auth/csrf-token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken: 'test-csrf', ok: true }) });
      return;
    }
    if (url.includes('/api/sessions') && method === 'GET') {
      sessionsFetchCount++;
      if (sessionsFetchCount === 1) {
        // First attempt: transient 503 (service unavailable).
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Service unavailable' }) });
      } else {
        // Retry: server has recovered, return the user's sessions.
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions }) });
      }
      return;
    }
    if (url.includes('/api/memories') || url.includes('/api/api-key') || url.includes('/api/usage') || url.includes('/api/projects')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], list: [], count: 0, ok: true, providers: [], activeId: null }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.addInitScript(() => {
    try { localStorage.removeItem('socrates-projects'); } catch (_) {}
    try { localStorage.removeItem('socrates-recents-filter'); } catch (_) {}
  });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500);

  await page.evaluate(() => {
    const tab = document.querySelector('[onclick*="switchTab(\'recents\')"]');
    if (tab) tab.click();
  }).catch(() => {});
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => {
    return {
      recentsCount: document.querySelectorAll('#recentsList .recent-item').length,
      fetchFailedFlag: window.SERVER_SESSIONS_FETCH_FAILED,
      serverSessionsLen: (window.SERVER_SESSIONS || []).length,
    };
  });

  console.log('[recovery test] fetch count:', sessionsFetchCount);
  console.log('[recovery test] SERVER_SESSIONS length:', result.serverSessionsLen);
  console.log('[recovery test] FETCH_FAILED flag:', result.fetchFailedFlag);
  console.log('[recovery test] Recents DOM count:', result.recentsCount);

  // The auto-retry should have fired (2 attempts) and recovered the sessions.
  expect(sessionsFetchCount, 'auto-retry should have fired a second attempt').toBe(2);
  expect(result.fetchFailedFlag, 'failure flag should be cleared after successful retry').toBe(false);
  expect(result.recentsCount, 'recovered session should render in the Recents list').toBe(1);
});
