// e2e/recents-archive-mobile.spec.mjs — phone ⋯ menu must show every action
// and archive must fire a real POST from a real click (no JS .click()).
// Regression: document capture-phase close swallowed the archive click, and
// `contain: layout` on .recent-item let the next row paint over the open menu.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SESSION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SECOND_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

test('phone row menu shows tag/archive/delete and archive POSTs from a real click', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'zh' });
  await page.setViewportSize({ width: 393, height: 851 });

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
    {
      id: SECOND_ID,
      title: 'Hello',
      topic: 'Hello',
      mode: 'chat',
      phase: 'chat',
      kind: 'chat',
      pinned: false,
      archivedAt: null,
      totalQ: 1,
      updatedAt: new Date(now - 60_000).toISOString(),
      createdAt: new Date(now - 60_000).toISOString(),
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
    try { localStorage.setItem('socrates-lang-app', 'zh'); } catch (_) {}
    try { localStorage.removeItem('socrates-recents-filter'); } catch (_) {}
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.waitForTimeout(500);

  // Expand the phone drawer if it boots collapsed.
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar?.classList.contains('collapsed')) window.toggleSidebar?.();
  });
  await page.waitForTimeout(300);

  const row = page.locator('#recentsList .recent-item', { hasText: 'Archive me please' });
  await expect(row).toBeVisible();

  // Real click on the ⋯ overflow — no evaluate/JS click.
  const overflow = row.locator('.recent-item-overflow');
  await expect(overflow).toBeVisible();
  await overflow.click();

  const menu = row.locator('.recent-item-menu');
  await expect(menu).toBeVisible();
  await expect(row).toHaveClass(/actions-open/);

  // All three actions must be visible (legacy .recent-item-del starts at opacity:0).
  const tagBtn = menu.locator('.recent-item-tag-btn');
  const archiveBtn = menu.locator('.recent-item-archive');
  const delBtn = menu.locator('.recent-item-del');
  await expect(tagBtn).toBeVisible();
  await expect(archiveBtn).toBeVisible();
  await expect(delBtn).toBeVisible();

  const styles = await menu.evaluate((el) => {
    const pick = (sel) => {
      const node = el.querySelector(sel);
      if (!node) return null;
      const cs = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      return { opacity: cs.opacity, display: cs.display, w: Math.round(r.width), h: Math.round(r.height) };
    };
    const menuCs = getComputedStyle(el);
    const rowEl = el.closest('.recent-item');
    const rowCs = rowEl ? getComputedStyle(rowEl) : null;
    return {
      menu: { display: menuCs.display, z: menuCs.zIndex },
      rowZ: rowCs?.zIndex ?? null,
      tag: pick('.recent-item-tag-btn'),
      archive: pick('.recent-item-archive'),
      del: pick('.recent-item-del'),
    };
  });
  expect(styles.menu.display).toBe('flex');
  expect(Number(styles.menu.z)).toBeGreaterThanOrEqual(100);
  expect(Number(styles.rowZ)).toBeGreaterThanOrEqual(100);
  for (const key of ['tag', 'archive', 'del']) {
    expect(styles[key], key).not.toBeNull();
    expect(Number(styles[key].opacity), `${key} opacity`).toBe(1);
    expect(styles[key].display, `${key} display`).not.toBe('none');
    expect(styles[key].w, `${key} width`).toBeGreaterThan(0);
    expect(styles[key].h, `${key} height`).toBeGreaterThan(0);
  }

  // Real click on 归档 — the document capture listener must not swallow it.
  await archiveBtn.click();

  await expect.poll(() => archiveCalls.length).toBeGreaterThan(0);
  await expect(row).toHaveCount(0);

  // Second session remains.
  await expect(page.locator('#recentsList .recent-item', { hasText: 'Hello' })).toBeVisible();
});
