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
  await expect(chatChips).toHaveAttribute('data-react-migration-runtime', 'attachment-chips');

  const topicChips = page.locator('#topicAttachmentChips');
  await expect(topicChips).toBeAttached();
  await expect(topicChips).toHaveAttribute('data-react-migration-runtime', 'attachment-chips');

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

  // Bridge snapshot reflects both attachments.
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
  await expect(chatChips).toHaveAttribute('data-react-migration-runtime', 'attachment-chips');

  const topicChips = page.locator('#topicAttachmentChips');
  await expect(topicChips).toHaveAttribute('data-react-migration-runtime', 'attachment-chips');

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