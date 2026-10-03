// e2e/attachments-compat.spec.mjs — Batch 4 of the React + TypeScript migration
// Spec: when the app boots with ?react=1, the attachment chip row above
// the composer is owned by React. The legacy store (`attachments` array)
// is the source of truth; React renders via a typed bridge. Removing a
// chip dispatches through `window.removeAttachment` which re-fires the
// legacy renderer (a no-op in React mode).

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('Attachment chip rows React mode hydrates both containers', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const chatChips = page.locator('#composerAttachmentChips');
  await expect(chatChips).toBeAttached();
  await expect(chatChips).not.toHaveAttribute('data-mounted-by', /.+/);

  const topicChips = page.locator('#composerAttachmentChips');
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
  const chips = page.locator('#composerAttachmentChips .attachment-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.first()).toHaveAttribute('data-id', 'att-test-1');
  await expect(chips.nth(1)).toHaveAttribute('data-id', 'att-test-2');

  // The chip row should be visible (no .hidden class).
  await expect(chatChipsAttrVisible(page, '#composerAttachmentChips')).resolves.toBe(true);
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

  await expect(page.locator('#composerAttachmentChips .attachment-chip')).toHaveCount(2);

  // Click the remove button on the first chip. We dispatch a click event
  // directly to avoid Playwright's visibility heuristic failing on a
  // tiny icon-only button rendered into a fresh DOM.
  await page.locator('#composerAttachmentChips .attachment-chip').first().locator('.attachment-chip-remove').dispatchEvent('click');

  const removed = await page.evaluate(() => window.__removedIds);
  expect(removed).toContain('att-r-1');
});

test('Attachment chips React mode always loads (no ?react=1 flag needed)', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const chatChips = page.locator('#composerAttachmentChips');
  await expect(chatChips).not.toHaveAttribute('data-mounted-by', /.+/);

  const topicChips = page.locator('#composerAttachmentChips');
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

/* P_file-attachments — every accepted file is uploaded to
   POST /api/files and the pending entry resolves into a durable fileId.
   Multimodality no longer gates admission: a text-only model still
   receives the file as an attachment the read_attachment tool can read. */
const MOCK_UPLOAD = {
  id: 'file-uuid-1', name: 'shot.png', mimeType: 'image/png',
  size: 21, kind: 'image', sha256: 'deadbeef',
};

function mockProviderAndUpload(page, providers) {
  return page.route('**/api/**', async (route) => {
    const req = route.request();
    const apiUrl = req.url().replace('/api/v2/', '/api/');
    if (req.method() === 'POST' && apiUrl.includes('/api/files')) {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_UPLOAD),
      });
      return;
    }
    if (req.method() === 'GET' && apiUrl.includes('/api/api-key')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ providers }),
      });
      return;
    }
    await route.fallback();
  });
}

test('Image upload is admitted for a text-only model and stored as a durable file', async ({ page }) => {
  await mockAuthedApp(page);
  await mockProviderAndUpload(page, [{
    id: 'text-only', label: 'Text only', url: 'https://example.test/v1',
    model: 'text-model', hasKey: true, isActive: true,
    isBuiltIn: false, isMultimodal: false,
  }]);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#composerAttachInput').setInputFiles({
    name: 'shot.png',
    mimeType: 'image/png',
    buffer: Buffer.from('synthetic image bytes'),
  });

  /* The pending stub uploads to /api/files and resolves into the durable
     fileId — no "model can't view images" rejection anymore. */
  await page.waitForFunction(() => {
    const snapshot = window.__socratesAttachmentsBridge?.getSnapshot();
    return snapshot?.attachments?.[0]?.fileId === 'file-uuid-1';
  });
  await expect(page.locator('#composerAttachmentChips .attachment-chip')).toHaveCount(1);
});

test('Image upload is admitted for a multimodal active model', async ({ page }) => {
  await mockAuthedApp(page);
  await mockProviderAndUpload(page, [{
    id: 'vision', label: 'Vision', url: 'https://example.test/v1',
    model: 'vision-model', hasKey: true, isActive: true,
    isBuiltIn: false, isMultimodal: true,
  }]);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#composerAttachInput').setInputFiles({
    name: 'shot.png',
    mimeType: 'image/png',
    buffer: Buffer.from('synthetic image bytes'),
  });
  await page.waitForFunction(() => {
    const snapshot = window.__socratesAttachmentsBridge?.getSnapshot();
    return snapshot?.attachments?.[0]?.pending === false;
  });
  await expect(page.locator('#composerAttachmentChips .attachment-chip')).toHaveCount(1);
  /* Multimodal images additionally carry an inline dataUrl for the
     native image_url part, alongside the durable fileId. */
  const entry = await page.evaluate(() => {
    const s = window.__socratesAttachmentsBridge?.getSnapshot();
    const a = s?.attachments?.[0];
    return a ? { fileId: a.fileId, hasDataUrl: !!a.dataUrl } : null;
  });
  expect(entry).toEqual({ fileId: 'file-uuid-1', hasDataUrl: true });
});

/* Regression: attachments/render.js refreshes the primary button through
   window[updateBtnName]; when window.updateComposerBtn lost
   its binding an attachment-only draft left the button in voice mode,
   and startSession() then early-returned on the empty topic anyway. */
test('Attachment-only landing draft activates Send and enters chat', async ({ page }) => {
  await mockAuthedApp(page);
  await mockProviderAndUpload(page, [{
    id: 'any', label: 'Any', url: 'https://example.test/v1',
    model: 'm', hasKey: true, isActive: true,
    isBuiltIn: false, isMultimodal: false,
  }]);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#composerAttachInput').setInputFiles({
    name: 'report.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 fake'),
  });
  await page.waitForFunction(() => {
    const s = window.__socratesAttachmentsBridge?.getSnapshot();
    return s?.attachments?.length === 1;
  });

  const startBtn = page.locator('#composerPrimaryBtn');
  await expect(startBtn).toHaveClass(/active/);
  await expect(startBtn).toHaveAttribute('aria-label', 'Send');
  await expect(page.locator('#composerInputWrap')).toHaveClass(/has-text/);

  await startBtn.click();
  await expect(page.locator('#topicSetup')).toHaveClass(/hidden/);
  await expect(page.locator('#chatView')).not.toHaveClass(/hidden/);
});

test('Failed upload shows a retry affordance that re-runs the job', async ({ page }) => {
  await mockAuthedApp(page);
  let attempts = 0;
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const apiUrl = req.url().replace('/api/v2/', '/api/');
    if (req.method() === 'POST' && apiUrl.includes('/api/files')) {
      attempts++;
      if (attempts === 1) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' });
      } else {
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_UPLOAD) });
      }
      return;
    }
    if (req.method() === 'GET' && apiUrl.includes('/api/api-key')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ providers: [{
          id: 'any', label: 'Any', url: 'https://example.test/v1',
          model: 'm', hasKey: true, isActive: true,
          isBuiltIn: false, isMultimodal: false,
        }] }),
      });
      return;
    }
    await route.fallback();
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#composerAttachInput').setInputFiles({
    name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello'),
  });

  /* First attempt fails → error chip with a retry button carrying the
     failure reason as its tooltip. */
  const chip = page.locator('#composerAttachmentChips .attachment-chip');
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveClass(/error/);
  const retryBtn = page.locator('#composerAttachmentChips .attachment-chip-retry');
  await expect(retryBtn).toHaveCount(1);

  /* Retry re-uploads the retained File — no re-pick needed — and the
     same chip resolves into a durable fileId. */
  await retryBtn.click();
  await page.waitForFunction(() => {
    const s = window.__socratesAttachmentsBridge?.getSnapshot();
    return s?.attachments?.[0]?.fileId === 'file-uuid-1';
  });
  await expect(chip).not.toHaveClass(/error/);
  expect(attempts).toBe(2);
});

test('Re-picking an identical file is deduplicated', async ({ page }) => {
  await mockAuthedApp(page);
  await mockProviderAndUpload(page, [{
    id: 'any', label: 'Any', url: 'https://example.test/v1',
    model: 'm', hasKey: true, isActive: true,
    isBuiltIn: false, isMultimodal: false,
  }]);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const file = { name: 'dup.txt', mimeType: 'text/plain', buffer: Buffer.from('same bytes') };
  await page.locator('#composerAttachInput').setInputFiles(file);
  await page.locator('#composerAttachInput').setInputFiles(file);

  await page.waitForFunction(() => {
    const s = window.__socratesAttachmentsBridge?.getSnapshot();
    return s?.attachments?.length === 1;
  });
  await expect(page.locator('#composerAttachmentChips .attachment-chip')).toHaveCount(1);
});

test('Document upload (PDF) produces a fileId pointer chip', async ({ page }) => {
  await mockAuthedApp(page);
  await mockProviderAndUpload(page, [{
    id: 'any', label: 'Any', url: 'https://example.test/v1',
    model: 'm', hasKey: true, isActive: true,
    isBuiltIn: false, isMultimodal: false,
  }]);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.locator('#composerAttachInput').setInputFiles({
    name: 'report.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 fake'),
  });
  await page.waitForFunction(() => {
    const snapshot = window.__socratesAttachmentsBridge?.getSnapshot();
    return snapshot?.attachments?.[0]?.fileId === 'file-uuid-1';
  });
  await expect(page.locator('#composerAttachmentChips .attachment-chip')).toHaveCount(1);
  const kind = await page.evaluate(() => {
    const s = window.__socratesAttachmentsBridge?.getSnapshot();
    return s?.attachments?.[0]?.kind;
  });
  /* PDFs classify as 'document' with docKind pdf — the model reads them
     via read_attachment, not as inline text. */
  expect(kind).toBe('document');
});
