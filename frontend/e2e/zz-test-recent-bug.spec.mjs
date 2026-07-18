// E2E test specifically for the recent sessions bug
import { test, expect } from '@playwright/test';

test('Recent sessions displays saved sessions', async ({ page }) => {
  // Inject a mock /api/auth/me + /api/sessions with 3 sessions
  await page.context().addCookies([
    { name: 'sid', value: 'test-sid', domain: '127.0.0.1', path: '/' },
    { name: 'csrf', value: 'test-csrf', domain: '127.0.0.1', path: '/' },
  ]);

  const now = Date.now();
  const sessions = [
    { id: 's1', userId: 'u1', topic: 'Math help', title: 'Math help', mode: 'chat', phase: 'chat', kind: 'chat', pinned: false, archivedAt: null, totalQ: 0, currentNode: 0, kbNodes: [], mistakes: [], updatedAt: new Date(now - 10000).toISOString(), createdAt: new Date(now - 10000).toISOString() },
    { id: 's2', userId: 'u1', topic: 'Physics question', title: 'Physics question', mode: 'chat', phase: 'chat', kind: 'chat', pinned: false, archivedAt: null, totalQ: 0, currentNode: 0, kbNodes: [], mistakes: [], updatedAt: new Date(now - 5000).toISOString(), createdAt: new Date(now - 5000).toISOString() },
    { id: 's3', userId: 'u1', topic: 'History chat', title: 'History chat', mode: 'chat', phase: 'chat', kind: 'chat', pinned: false, archivedAt: null, totalQ: 0, currentNode: 0, kbNodes: [], mistakes: [], updatedAt: new Date(now).toISOString(), createdAt: new Date(now).toISOString() },
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

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // Switch to recents tab
  await page.evaluate(() => {
    const tab = document.querySelector('[onclick*="switchTab(\'recents\')"]');
    if (tab) tab.click();
  }).catch(() => {});

  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => {
    return {
      recentsCount: document.querySelectorAll('#recentsList .recent-item').length,
      recentsHTML: (document.getElementById('recentsList') || {}).innerHTML || '',
      serverSessions: (window.SERVER_SESSIONS || []).map(s => ({ id: s.id, title: s.title, updatedAt: s.updatedAt })),
      serverSessionsLen: (window.SERVER_SESSIONS || []).length,
    };
  });

  console.log('Server sessions:', JSON.stringify(result.serverSessions, null, 2));
  console.log('Server sessions count:', result.serverSessionsLen);
  console.log('Recents DOM count:', result.recentsCount);
  console.log('Recents HTML (first 500):', result.recentsHTML.slice(0, 500));
});
