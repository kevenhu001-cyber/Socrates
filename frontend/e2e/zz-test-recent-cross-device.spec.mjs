// E2E test for the cross-device Recent list bug:
// Sessions assigned to a custom project (created on Device A) must still
// render on Device B where the project doesn't exist in local PROJECTS.
import { test, expect } from '@playwright/test';

const CUSTOM_PROJECT_ID = '11111111-2222-3333-4444-555555555555';

test('Recent list renders sessions whose projectId is unknown to the local PROJECTS', async ({ page }) => {
  await page.context().addCookies([
    { name: 'sid', value: 'test-sid', domain: '127.0.0.1', path: '/' },
    { name: 'csrf', value: 'test-csrf', domain: '127.0.0.1', path: '/' },
  ]);

  const now = Date.now();
  // 3 sessions: one Inbox (no projectId), two assigned to a custom project
  // that exists on the server but is NOT in this device's localStorage.
  const sessions = [
    { id: 's-inbox-1', userId: 'u1', topic: 'Inbox chat', title: 'Inbox chat', mode: 'chat', phase: 'chat', kind: 'chat', pinned: false, archivedAt: null, totalQ: 0, currentNode: 0, kbNodes: [], mistakes: [], updatedAt: new Date(now - 10000).toISOString(), createdAt: new Date(now - 10000).toISOString() },
    { id: 's-foo-1', userId: 'u1', topic: 'Foo chat 1', title: 'Foo chat 1', mode: 'chat', phase: 'chat', kind: 'chat', pinned: false, archivedAt: null, totalQ: 0, currentNode: 0, kbNodes: [], mistakes: [], projectId: CUSTOM_PROJECT_ID, updatedAt: new Date(now - 5000).toISOString(), createdAt: new Date(now - 5000).toISOString() },
    { id: 's-foo-2', userId: 'u1', topic: 'Foo chat 2', title: 'Foo chat 2', mode: 'chat', phase: 'chat', kind: 'chat', pinned: false, archivedAt: null, totalQ: 0, currentNode: 0, kbNodes: [], mistakes: [], projectId: CUSTOM_PROJECT_ID, updatedAt: new Date(now).toISOString(), createdAt: new Date(now).toISOString() },
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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions }) });
      return;
    }
    if (url.includes('/api/memories') || url.includes('/api/api-key') || url.includes('/api/usage') || url.includes('/api/projects')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], list: [], count: 0, ok: true, providers: [], activeId: null }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  // Ensure NO stale localStorage from a prior run (simulates a fresh device).
  await page.addInitScript(() => {
    try { localStorage.removeItem('socrates-projects'); } catch (_) {}
    try { localStorage.removeItem('socrates-recents-filter'); } catch (_) {}
  });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // Switch to recents tab.
  await page.evaluate(() => {
    const tab = document.querySelector('[onclick*="switchTab(\'recents\')"]');
    if (tab) tab.click();
  }).catch(() => {});
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => {
    return {
      recentsCount: document.querySelectorAll('#recentsList .recent-item').length,
      recentsHTML: (document.getElementById('recentsList') || {}).innerHTML || '',
      serverSessionsLen: (window.SERVER_SESSIONS || []).length,
      projectsLen: (window.PROJECTS || []).length,
      activeProjectFilter: window.state && window.state.session && window.state.session.activeProjectFilter,
      recentsFilter: window.getRecentsFilter && window.getRecentsFilter(),
    };
  });

  console.log('Server sessions count:', result.serverSessionsLen);
  console.log('PROJECTS length:', result.projectsLen);
  console.log('activeProjectFilter:', result.activeProjectFilter);
  console.log('recentsFilter:', result.recentsFilter);
  console.log('Recents DOM count:', result.recentsCount);
  console.log('Recents HTML (first 400):', result.recentsHTML.slice(0, 400));

  // All 3 sessions should render: no filter is active on a fresh page load,
  // and sessions whose projectId isn't in local PROJECTS still show.
  expect(result.recentsCount, 'Recents list should render all 3 sessions').toBe(3);
});
