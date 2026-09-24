// e2e/recents-archive.spec.mjs — quick archive from the Recents row menu.
// Soft-hide only: POST /api/sessions/:id/archive, row leaves Recents,
// Storage modal lists it for restore / permanent delete.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SESSION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

test('archive from Recents row soft-hides the session and surfaces it in Storage', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });

  const now = Date.now();
  let sessions = [
    {
      id: SESSION_ID,
      title: 'Archive me please',
      topic: 'Archive me please',
      mode: 'chat',
      phase: 'chat',
      kind: 'chat',
      pinned: false,
      archivedAt: null,
      totalQ: 1,
      updatedAt: new Date(now).toISOString(),
      createdAt: new Date(now).toISOString(),
      tags: [],
    },
  ];
  const archiveCalls = [];

  await page.route('**/api/**', async (route) => {
    const url = route.request().url().replace('/api/v2/', '/api/');
    const method = route.request().method();
    if (url.includes('/api/auth/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'u1', email: 't@t.com', verifiedAt: '2026-01-01' } }),
      });
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
    if (/\/api\/(?:v2\/)?sessions\/[^/]+\/archive$/.test(url) && method === 'POST') {
      archiveCalls.push(url);
      const id = url.split('/sessions/')[1].split('/')[0];
      sessions = sessions.map((s) => (s.id === id ? { ...s, archivedAt: new Date().toISOString() } : s));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    if (/\/api\/(?:v2\/)?sessions/.test(url) && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions }) });
      return;
    }
    if (url.includes('/api/memories') || url.includes('/api/api-key') || url.includes('/api/usage') || url.includes('/api/projects')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], list: [], count: 0, ok: true }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.addInitScript(() => {
    try { localStorage.setItem('socrates-lang-app', 'en'); } catch (_) {}
    try { localStorage.removeItem('socrates-recents-filter'); } catch (_) {}
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.waitForTimeout(500);

  const row = page.locator('#recentsList .recent-item', { hasText: 'Archive me please' });
  await expect(row).toBeVisible();

  // Desktop shows the icon pair inline (display:contents); force visibility
  // for headless hover-free clicking.
  const archiveBtn = row.locator('.recent-item-archive');
  await expect(archiveBtn).toHaveAttribute('data-archive-session', '1');
  await archiveBtn.evaluate((el) => {
    el.style.opacity = '1';
    el.style.pointerEvents = 'auto';
  });
  await archiveBtn.click();

  await expect.poll(() => archiveCalls.length).toBeGreaterThan(0);
  await expect(row).toHaveCount(0);

  // Archived row is listable via getArchivedSessions → Storage bridge.
  const archived = await page.evaluate(() => {
    const list = window.getArchivedSessions ? window.getArchivedSessions() : [];
    return list.map((s) => ({ id: s.id, archivedAt: s.archivedAt }));
  });
  expect(archived.map((s) => s.id)).toContain(SESSION_ID);
  expect(archived[0]?.archivedAt).toBeTruthy();

  // Open the Storage modal and confirm the row is restorable.
  await page.evaluate(() => window.__socratesLegacy.navigation.openStorageModal());
  const storageRow = page.locator('#storageModalOverlay .storage-row', { hasText: 'Archive me please' });
  await expect(storageRow).toBeVisible();
  await expect(storageRow.locator('.storage-btn-restore')).toBeVisible();
  await expect(storageRow.locator('.storage-btn-delete')).toBeVisible();
});
