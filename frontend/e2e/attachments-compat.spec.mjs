// e2e/attachments-compat.spec.mjs — Batch 4 of the React + TypeScript migration
// Spec: when the app boots with ?react=1, the attachment chip row above
// the composer is owned by React. The legacy store (`attachments` array)
// is the source of truth; React renders via a typed bridge. Removing a
// chip dispatches through `window.removeAttachment` which re-fires the
// legacy renderer (a no-op in React mode).

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('Attachment chip rows React mode hydrates both containers', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const chatChips = page.locator('#attachmentChips');
  await expect(chatChips).toBeAttached();
  await expect(chatChips).not.toHaveAttribute('data-mounted-by', /.+/);

  const topicChips = page.locator('#topicAttachmentChips');
  await expect(topicChips).toBeAttached();
  await expect(topicChips).not.toHaveAttribute('data-mounted-by', /.+/);

  // Bridge installed.
  const installed = await page.evaluate(() => ({
    bridge: typeof window.__socratesAttachmentsBridge === 'object' && window.__socratesAttachmentsBridge !== null,
    empty: Array.isArray(window.__socratesAttachmentsBridge?.getSnapshot().attachments)
      && window.__socratesAttachmentsBridge.getSnapshot().attachments.length === 0,
  }));
  expect(installed).toEqual({ bridge: true, empty: true });
});

test('Attachment chips React mode mirrors the legacy attachments array', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // Drive the bridge directly with a synthetic snapshot. This is what
  // the legacy `renderAttachmentChips` would publish after a real
  // `addFiles()` mutation — testing the React side of the contract.
  await page.evaluate(() => {
    window.__socratesAttachmentsBridge.publish({
      attachments: [
        {
          id: 'att-test-1',
          kind: 'image',
          name: 'cat.png',
          mime: 'image/png',
          size: 1234,
          dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        },
        {
          id: 'att-test-2',
          kind: 'text',
          name: 'notes.txt',
          mime: 'text/plain',
          size: 4321,
          text: 'hello world',
          truncated: false,
        },
      ],
    });
  });

  // The bridge batches publishes on requestAnimationFrame, so wait for the
  // committed external-store snapshot before asserting its contents.
  await page.waitForFunction(() => {
    const s = window.__socratesAttachmentsBridge?.getSnapshot();
    return s?.attachments?.length === 2;
  });
  const snap = await page.evaluate(() => {
    const s = window.__socratesAttachmentsBridge?.getSnapshot();
    return s ? s.attachments.map((a) => ({ id: a.id, kind: a.kind, name: a.name })) : null;
  });
  expect(snap).toEqual([
    { id: 'att-test-1', kind: 'image', name: 'cat.png' },
    { id: 'att-test-2', kind: 'text', name: 'notes.txt' },
  ]);

  // React rendered both chips in the chat composer.
  const chips = page.locator('#attachmentChips .attachment-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.first()).toHaveAttribute('data-id', 'att-test-1');
  await expect(chips.nth(1)).toHaveAttribute('data-id', 'att-test-2');

  // The chip row should be visible (no .hidden class).
  await expect(chatChipsAttrVisible(page, '#attachmentChips')).resolves.toBe(true);
});

test('Attachment chips remove button dispatches through window.removeAttachment', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // Seed two attachments via the bridge and stub the legacy
  // removeAttachment on the bridge so we can capture the call.
  await page.evaluate(() => {
    window.__removedIds = [];
    window.__socratesLegacy.composer.removeAttachment = function (id) {
      window.__removedIds.push(id);
      return true;
    };
    window.__socratesAttachmentsBridge.publish({
      attachments: [
        { id: 'att-r-1', kind: 'image', name: 'one.png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
        { id: 'att-r-2', kind: 'image', name: 'two.png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
      ],
    });
  });

  await expect(page.locator('#attachmentChips .attachment-chip')).toHaveCount(2);

  // Click the remove button on the first chip. We dispatch a click event
  // directly to avoid Playwright's visibility heuristic failing on a
  // tiny icon-only button rendered into a fresh DOM.
  await page.locator('#attachmentChips .attachment-chip').first().locator('.attachment-chip-remove').dispatchEvent('click');

  const removed = await page.evaluate(() => window.__removedIds);
  expect(removed).toContain('att-r-1');
});

test('Attachment chips React mode always loads (no ?react=1 flag needed)', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const chatChips = page.locator('#attachmentChips');
  await expect(chatChips).not.toHaveAttribute('data-mounted-by', /.+/);

  const topicChips = page.locator('#topicAttachmentChips');
  await expect(topicChips).not.toHaveAttribute('data-mounted-by', /.+/);

  const installed = await page.evaluate(
    () => typeof window.__socratesAttachmentsBridge === 'object' && window.__socratesAttachmentsBridge !== null,
  );
  expect(installed).toBe(true);
});

async function chatChipsAttrVisible(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return !!el && !el.classList.contains('hidden');
  }, selector);
}

test('Image upload is rejected immediately for a text-only active model', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const apiUrl = req.url().replace('/api/v2/', '/api/');
    if (req.method() === 'GET' && apiUrl.includes('/api/api-key')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [{
            id: 'text-only', label: 'Text only', url: 'https://example.test/v1',
            model: 'text-model', hasKey: true, isActive: true,
            isBuiltIn: false, isMultimodal: false,
          }],
        }),
      });
      return;
    }
    await route.fallback();
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const startedAt = await page.evaluate(() => performance.now());
  await page.locator('#attachInput').setInputFiles({
    name: 'not-supported.png',
    mimeType: 'image/png',
    buffer: Buffer.from('synthetic image bytes'),
  });

  const toast = page.locator('.msg-toast').last();
  await expect(toast).toContainText("can't view images");
  const elapsed = await page.evaluate((started) => performance.now() - started, startedAt);
  expect(elapsed).toBeLessThan(1000);
  await expect(page.locator('#attachmentChips .attachment-chip')).toHaveCount(0);
  await expect(page.locator('#topicAttachmentChips .attachment-chip')).toHaveCount(0);
});

test('Image upload is admitted for a multimodal active model', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const apiUrl = req.url().replace('/api/v2/', '/api/');
    if (req.method() === 'GET' && apiUrl.includes('/api/api-key')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [{
            id: 'vision', label: 'Vision', url: 'https://example.test/v1',
            model: 'vision-model', hasKey: true, isActive: true,
            isBuiltIn: false, isMultimodal: true,
          }],
        }),
      });
      return;
    }
    await route.fallback();
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#attachInput').setInputFiles({
    name: 'supported.png',
    mimeType: 'image/png',
    buffer: Buffer.from('synthetic image bytes'),
  });
  await page.waitForFunction(() => {
    const snapshot = window.__socratesAttachmentsBridge?.getSnapshot();
    return snapshot?.attachments?.[0]?.pending === false;
  });
  await expect(page.locator('#attachmentChips .attachment-chip')).toHaveCount(1);
});
