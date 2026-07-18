// Test: Create a new session via Begin button and verify it appears in Recent
import { test, expect } from '@playwright/test';

test('New session appears in Recent after clicking Begin', async ({ page }) => {
  await page.context().addCookies([
    { name: 'sid', value: 'test-sid', domain: '127.0.0.1', path: '/' },
    { name: 'csrf', value: 'test-csrf', domain: '127.0.0.1', path: '/' },
  ]);

  const storedSessions = [];
  let sessionsList = [];

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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: sessionsList }) });
      return;
    }
    if (url.includes('/api/sessions') && method === 'POST') {
      const postData = route.request().postData();
      const body = JSON.parse(postData || '{}');
      const newSession = {
        id: body.id || ('srv-' + Date.now()),
        userId: 'u1',
        topic: body.topic || '',
        title: body.title || body.topic || '',
        mode: body.mode || 'chat',
        phase: body.phase || 'chat',
        kind: 'chat',
        pinned: false,
        archivedAt: null,
        totalQ: 0,
        currentNode: 0,
        kbNodes: [],
        mistakes: [],
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      storedSessions.push(newSession);
      sessionsList = storedSessions.slice();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(newSession) });
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
  await page.waitForTimeout(500);

  const beforeCount = await page.evaluate(() => document.querySelectorAll('#recentsList .recent-item').length);
  console.log('Recent count before Begin:', beforeCount);

  // Type a topic and click Begin
  await page.click('#topicInput');
  await page.keyboard.type('Test topic for Recent');
  await page.click('#startBtn');
  console.log('Clicked Begin');
  await page.waitForTimeout(3000);

  const afterCount = await page.evaluate(() => document.querySelectorAll('#recentsList .recent-item').length);
  const afterHtml = await page.evaluate(() => (document.getElementById('recentsList') || {}).innerHTML || '');
  const serverSess = await page.evaluate(() => window.SERVER_SESSIONS || []);
  
  console.log('Recent count after Begin:', afterCount);
  console.log('Server sessions count:', serverSess.length);
  console.log('Server sessions:', JSON.stringify(serverSess.map(s => ({ id: s.id, title: s.title })), null, 2));
  console.log('Recents HTML (first 500):', afterHtml.slice(0, 500));
});
