import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const idFor = (i) => `77777777-0000-4000-8000-${String(i).padStart(12, '0')}`;

test('recent chats are cursor-paged, old pinned chats survive and archives load on demand', async ({
  page,
}) => {
  await mockAuthedApp(page, { lang: 'en' });

  const sessions = Array.from({ length: 105 }, (_, i) => ({
    id: idFor(i),
    title: `Chat ${i}`,
    topic: `Chat ${i}`,
    mode: 'chat',
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 0)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 0) - i * 1000).toISOString(),
    pinned: i === 92,
    archivedAt: i === 104 ? new Date('2026-11-19T00:00:00Z').toISOString() : null,
    tags: [],
  }));
  const visible = sessions.filter((session) => !session.archivedAt);
  const requests = [];

  await page.route(/\/api\/(?:v2\/)?sessions(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    let rows = visible;
    if (url.searchParams.has('archivedOnly'))
      rows = sessions.filter((session) => session.archivedAt);
    else if (url.searchParams.has('pinnedOnly')) rows = visible.filter((session) => session.pinned);

    const cursor = Number(url.searchParams.get('cursor')?.replace('page-', '') || 0);
    const limit = Number(url.searchParams.get('limit') || 40);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessions: rows.slice(cursor, cursor + limit),
        nextCursor: cursor + limit < rows.length ? `page-${cursor + limit}` : null,
      }),
    });
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  const list = page.locator('#recentsList');
  await expect(list.getByText('Chat 0', { exact: true })).toBeVisible();
  await expect(list.getByText('Chat 92', { exact: true })).toBeVisible();
  expect(requests.some((query) => query.includes('limit=40'))).toBe(true);
  expect(requests.some((query) => query.includes('pinnedOnly=true'))).toBe(true);

  const history = page.locator('#recentsPanel');
  await history.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => requests.filter((query) => query.includes('cursor=page-')).length)
    .toBeGreaterThan(0);
  expect(await list.locator('.recent-item').count()).toBeLessThan(70);
  expect(requests.some((query) => query.includes('archivedOnly=true'))).toBe(false);

  await page.evaluate(() => window.__socratesLegacy.navigation.openStorageModal());
  await expect.poll(() => requests.some((query) => query.includes('archivedOnly=true'))).toBe(true);
  await expect(page.locator('#storageModalOverlay')).toContainText('Chat 104');
});
