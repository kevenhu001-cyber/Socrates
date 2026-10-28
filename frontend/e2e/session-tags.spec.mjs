// e2e/session-tags.spec.mjs — the session tag editor is a React popover.
// Locks the contract the legacy markup owned: open from the row menu, anchor
// to the row, add via Enter (comma separated), remove via the badge ×, and
// sync each mutation to PUT /api/sessions/:id/tags.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SESSION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function session(id, title, tags, updatedAt) {
  return {
    id,
    title,
    topic: title,
    mode: 'chat',
    phase: 'chat',
    kind: 'chat',
    pinned: false,
    archivedAt: null,
    totalQ: 1,
    updatedAt,
    createdAt: updatedAt,
    tags,
  };
}

test('tag editor adds, removes and closes', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });
  await page.setViewportSize({ width: 1280, height: 860 });

  const now = Date.now();
  const sessions = [
    session(SESSION_ID, 'Tag editor target', ['philosophy'], new Date(now).toISOString()),
    session('bbbbbbbb-0000-4000-8000-000000000001', 'Second session', [], new Date(now - 60_000).toISOString()),
  ];
  const tagWrites = [];

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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
      return;
    }
    if (url.includes('/tags') && method === 'PUT') {
      tagWrites.push(JSON.parse(route.request().postData() || '{}'));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    if (url.includes('/api/sessions') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions, total: sessions.length }),
      });
      return;
    }
    if (url.includes('/api/projects')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  await page.goto('/');
  await gotoAndSettle(page);
  await waitForAppShell(page);

  const row = page.locator(`.recent-item[data-recent-actual="${SESSION_ID}"]`);
  await expect(row).toBeVisible();
  await row.hover();
  await row.locator('[data-i18n-title="session.moreActions"]').click();
  await page.getByRole('menuitem', { name: /tag/i }).first().click();

  const pop = page.locator('#tagEditorPopover');
  await expect(pop).toBeVisible();
  await expect(pop.getByRole('dialog')).toBeVisible();
  await expect(pop.locator('[data-slot="badge"]')).toHaveCount(1);

  // The popover anchors to the clicked row instead of centering.
  const rowBox = await row.boundingBox();
  const popBox = await pop.boundingBox();
  expect(popBox.y).toBeGreaterThan(rowBox.y + rowBox.height - 1);

  const input = pop.getByRole('textbox');
  await expect(input).toBeFocused();
  await input.fill('ethics, virtue');
  await input.press('Enter');

  await expect(pop.locator('[data-slot="badge"]')).toHaveCount(3);
  await expect.poll(() => tagWrites.length).toBe(2);
  expect(tagWrites[0]).toEqual({ tags: ['philosophy', 'ethics'] });
  expect(tagWrites[1]).toEqual({ tags: ['philosophy', 'ethics', 'virtue'] });
  // Draft is cleared, focus stays in the field for the next tag.
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();

  await pop.getByRole('button', { name: 'Remove: philosophy' }).click();
  await expect(pop.locator('[data-slot="badge"]')).toHaveCount(2);
  await expect.poll(() => tagWrites.length).toBe(3);
  expect(tagWrites[2]).toEqual({ tags: ['ethics', 'virtue'] });

  await page.keyboard.press('Escape');
  await expect(pop).not.toBeVisible();
});
