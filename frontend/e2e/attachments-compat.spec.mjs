// e2e/attachments-compat.spec.mjs — Batch 4 of the React + TypeScript migration
// The attachment chip row is React-owned. These specs use the file input and
// rendered chip actions so they exercise the same path a learner uses.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('Attachment chip row React mode hydrates without a window array alias', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const chatChips = page.locator('#composerAttachmentChips');
  await expect(chatChips).toBeAttached();
  await expect(chatChips).not.toHaveAttribute('data-mounted-by', /.+/);

  const ownership = await page.evaluate(() => ({
    bridge: '__socratesAttachmentsBridge' in window,
    retryAlias: 'retryComposerAttachment' in window,
    typedRetry: typeof window.__socratesLegacy?.composer?.retryAttachment === 'function',
    renderAlias: 'renderAttachmentChips' in window,
    typedRenderer: typeof window.__socratesLegacy?.composer?.renderAttachmentChips === 'function',
    windowArrayAlias: 'attachments' in window,
  }));
  expect(ownership).toEqual({ bridge: false, retryAlias: false, typedRetry: true, renderAlias: false, typedRenderer: true, windowArrayAlias: false });
});

test('Attachment chips React mode render files selected through the composer', async ({ page }) => {
  await mockAuthedApp(page);
  await mockProviderAndUpload(page, []);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.locator('#composerAttachInput').setInputFiles([
    { name: 'cat.png', mimeType: 'image/png', buffer: Buffer.from('image bytes') },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello world') },
  ]);

  const chips = page.locator('#composerAttachmentChips .attachment-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toHaveAttribute('title', 'cat.png');
  await expect(chips.nth(1)).toHaveAttribute('title', 'notes.txt');
  await expect(chatChipsAttrVisible(page, '#composerAttachmentChips')).resolves.toBe(true);
});

test('Attachment chips remove through the React action', async ({ page }) => {
  await mockAuthedApp(page);
  await mockProviderAndUpload(page, []);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.locator('#composerAttachInput').setInputFiles([
    { name: 'one.txt', mimeType: 'text/plain', buffer: Buffer.from('first') },
    { name: 'two.txt', mimeType: 'text/plain', buffer: Buffer.from('second') },
  ]);

  const chips = page.locator('#composerAttachmentChips .attachment-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.first()).toHaveAttribute('title', 'one.txt');
  await chips.first().getByRole('button', { name: '移除附件' }).click({ force: true });
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toHaveAttribute('title', 'two.txt');
});

test('Attachment chips React mode always loads (no ?react=1 flag needed)', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const chatChips = page.locator('#composerAttachmentChips');
  await expect(chatChips).not.toHaveAttribute('data-mounted-by', /.+/);

  const retired = await page.evaluate(() => !('__socratesAttachmentsBridge' in window));
  expect(retired).toBe(true);
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

  /* The React chip settles through the durable upload path without a
     model-capability rejection. */
  const chip = page.locator('#composerAttachmentChips .attachment-chip');
  await expect(chip).toHaveCount(1);
  await expect(chip).not.toHaveClass(/pending|error/);
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
  const chip = page.locator('#composerAttachmentChips .attachment-chip');
  await expect(chip).toHaveCount(1);
  await expect(chip).not.toHaveClass(/pending|error/);
  await expect(chip.locator('.attachment-chip-visual')).toHaveAttribute('data-kind', 'image');
});

/* Regression: the attachment snapshot must activate the React-owned primary
   button so an attachment-only landing draft can enter chat. */
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
  await expect(page.locator('#composerAttachmentChips .attachment-chip')).toHaveCount(1);

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
  await expect(chip).not.toHaveClass(/error|pending/);
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
  const chip = page.locator('#composerAttachmentChips .attachment-chip');
  await expect(chip).toHaveCount(1);
  await expect(chip).not.toHaveClass(/pending|error/);
  /* PDFs classify as documents in the rendered attachment affordance. */
  await expect(chip.locator('.attachment-chip-visual')).toHaveAttribute('data-kind', 'pdf');
});
