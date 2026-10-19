import { test, expect } from '@playwright/test';
import { ensureSidebarOpen } from './_universal-helpers.mjs';

const sessionId = '11111111-1111-4111-8111-111111111111';
const session = {
  id: sessionId, title: 'Polish history', topic: '', mode: 'chat', phase: 'chat', projectId: null,
  messages: [
    { clientId: 'user-1', role: 'user', rawText: 'A question from history' },
    { clientId: 'assistant-1', role: 'assistant', rawText: 'A helpful historical answer.' },
  ],
};

async function mockAccount(page) {
  await page.route('**/api/v2/**', (route) => {
    const { pathname } = new URL(route.request().url());
    let body = {};
    if (pathname.endsWith('/auth/me')) body = { user: { id: 'polish-user', email: 'test@example.com', displayName: 'Reader' } };
    else if (pathname.endsWith('/sessions')) body = route.request().method() === 'POST'
      ? { ...route.request().postDataJSON(), id: sessionId }
      : { sessions: [{ ...session, messages: undefined }], nextCursor: null };
    else if (pathname.endsWith(`/sessions/${sessionId}`)) body = session;
    else if (pathname.endsWith('/projects')) body = { projects: [] };
    else if (pathname.endsWith('/api-key')) body = { providers: [] };
    else if (pathname.endsWith('/assistants')) body = { items: [] };
    else if (pathname.endsWith('/account/usage')) body = { user: { id: 'polish-user' }, plan: { name: 'Test' }, usage: {} };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function openHistory(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await ensureSidebarOpen(page);
  const history = page.getByRole('button', { name: 'Polish history', exact: true });
  await expect(history).toBeVisible({ timeout: 20_000 });
  await history.click();
  await expect(page.getByText('A helpful historical answer.', { exact: true })).toBeVisible();
}

test('history shows only connected message actions', async ({ page }) => {
  await mockAccount(page);
  await openHistory(page);
  for (const label of ['Helpful', 'Not helpful', 'Re-explain', 'Delete message']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  }
  for (const label of ['Copy', 'Regenerate response', 'Branch from here']) {
    await expect(page.getByRole('button', { name: label, exact: true }).last()).toBeVisible();
  }
});

test('composer remains usable at compact and desktop widths', async ({ page }, testInfo) => {
  await mockAccount(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const editor = page.getByLabel('Ask Socrates', { exact: true });
  await expect(editor).toBeVisible({ timeout: 20_000 });
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 850 });
    await editor.fill('A long draft that wraps across multiple lines.\nSecond line with more text.\nThird line keeps the editor expanded.');
    await expect(editor).toBeFocused();
    await expect(editor).toHaveCSS('outline-style', 'none');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const boxes = await Promise.all([
      editor.boundingBox(),
      page.getByRole('button', { name: 'Add photos and files', exact: true }).boundingBox(),
      page.getByRole('button', { name: 'Send message', exact: true }).boundingBox(),
    ]);
    expect(boxes.every(Boolean)).toBe(true);
    const [input, attach, primary] = boxes;
    expect(input.x + input.width).toBeLessThanOrEqual(width + 1);
    expect(primary.x + primary.width).toBeLessThanOrEqual(width + 1);
    for (const control of [attach, primary]) {
      const overlaps = input.x < control.x + control.width && input.x + input.width > control.x
        && input.y < control.y + control.height && input.y + input.height > control.y;
      expect(overlaps).toBe(false);
    }
    if (width >= 768) {
      expect(attach.y + attach.height).toBeGreaterThan(input.y + input.height - 2);
      expect(primary.y + primary.height).toBeGreaterThan(input.y + input.height - 2);
    }
  }
  await page.setViewportSize(testInfo.project.use.viewport || { width: 1024, height: 850 });
  await page.screenshot({ path: `test-results/universal-polish-${encodeURIComponent(testInfo.project.name)}.png` });
});

test('opening attachment menu then focusing editor dismisses the menu', async ({ page }) => {
  await mockAccount(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const editor = page.getByLabel('Ask Socrates', { exact: true });
  await expect(editor).toBeVisible({ timeout: 20_000 });
  const attach = page.getByRole('button', { name: 'Add photos and files', exact: true });
  await attach.click();
  const photos = page.getByRole('button', { name: 'Attach photos', exact: true });
  await expect(photos).toBeVisible();
  await expect(attach).toHaveAttribute('aria-expanded', 'true');
  await editor.click();
  await expect(photos).toHaveCount(0);
  await expect(attach).toHaveAttribute('aria-expanded', 'false');
});
