// tmp-diag-attach.spec.mjs — TEMPORARY diagnostic spec (deleted after use)
// Verifies: (A) multimodal gate behavior on image upload; (B) upload latency breakdown.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NOISE_BUF = fs.readFileSync(resolve(__dirname, 'tmp-diag-noise.png'));
const MIXED_BUF = fs.readFileSync(resolve(__dirname, 'tmp-diag-mixed.png'));
const GRAD_BUF = fs.readFileSync(resolve(__dirname, 'tmp-diag-grad.png'));
const PHOTO_BUF = fs.readFileSync(resolve(__dirname, 'tmp-diag-photo.png'));

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Access-Control-Allow-Origin': '*' },
  };
}

/* Full catch-all mirroring _mock-api.mjs but with configurable providers.
   Registered AFTER mockAuthedApp so it wins (last registered = first matched). */
async function bootWithProviders(page, providers, cfg) {
  await mockAuthedApp(page);
  await page.route('**/api/**', (route) => {
    const req = route.request();
    const url = req.url().replace('/api/v2/', '/api/');
    if (url.endsWith('/api/auth/me') || url.includes('/api/auth/me?')) return route.fulfill(jsonResponse({ user: { id: 'u-test-1', email: 'smoke@example.test', name: 'Smoke', verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes' } }));
    if (url.endsWith('/api/config') || url.includes('/api/config?')) return route.fulfill(jsonResponse(cfg));
    if (url.endsWith('/api/auth/csrf-token')) return route.fulfill(jsonResponse({ csrfToken: 'smoke-csrf-token', ok: true }));
    if (url.includes('/api/sessions')) {
      if (req.method() === 'GET') return route.fulfill(jsonResponse({ sessions: [] }));
      return route.fulfill(jsonResponse({ session: { id: 'smoke-saved-1' } }));
    }
    if (url.includes('/api/api-key')) {
      if (req.method() === 'GET') return route.fulfill(jsonResponse({ providers, activeId: null }));
      return route.fulfill(jsonResponse({ ok: true }, 200));
    }
    return route.fulfill(jsonResponse({ ok: true, stub: true }));
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
}

async function injectPerfWatchers(page) {
  await page.evaluate(() => {
    window.__diag = { longtasks: [], consoleLogs: [], timeline: [], t0: null };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__diag.longtasks.push({ dur: Math.round(e.duration), start: Math.round(e.startTime) });
      }).observe({ entryTypes: ['longtask'] });
    } catch (_) {}
    window.__diag.rec = (evt) => {
      window.__diag.timeline.push({ evt, at: Math.round(performance.now() - (window.__diag.t0 || 0)) });
    };
    /* Watch chip container + toast DOM for state transitions. */
    const obs = new MutationObserver(() => {
      if (!window.__diag.t0) return;
      const chip = document.querySelector('#attachmentChips .attachment-chip');
      window.__diag.chipSeen = window.__diag.chipSeen || !!chip;
      if (chip && !window.__diag.chipPending && chip.classList.contains('pending')) { window.__diag.chipPending = Math.round(performance.now() - window.__diag.t0); }
      if (chip && !chip.classList.contains('pending') && !window.__diag.chipSettled) { window.__diag.chipSettled = Math.round(performance.now() - window.__diag.t0); }
      const toast = document.querySelector('.msg-toast');
      if (toast && !window.__diag.toastAt) { window.__diag.toastText = toast.textContent; window.__diag.toastAt = Math.round(performance.now() - window.__diag.t0); }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
  await page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[attachments]') || text.includes('multimodal')) {
      page.evaluate((t) => { if (window.__diag) window.__diag.consoleLogs.push(t); }, text).catch(() => {});
    }
  });
}

test('A1: non-multimodal provider rejects image upload with toast (immediate)', async ({ page }) => {
  await bootWithProviders(page, [
    { id: 'p-mm-off', label: 'TextOnly', url: 'https://example.com/v1', model: 'text-model', hasKey: true, isActive: true, isBuiltIn: false, isMultimodal: false },
  ], { hasBeagleKey: false });

  const before = await page.evaluate(() => ({
    active: window.getActiveProvider ? { id: window.getActiveProvider()?.id, vision: window.getActiveProvider()?.vision } : null,
    providers: (window.apiConfig && window.apiConfig.providers || []).map((p) => ({ id: p.id, vision: p.vision })),
  }));
  console.log('[A1] active provider before upload:', JSON.stringify(before));
  expect(before.active).toEqual({ id: 'p-mm-off', vision: false });

  await injectPerfWatchers(page);
  await page.evaluate(() => { window.__diag.t0 = performance.now(); });

  await page.locator('#attachInput').setInputFiles({ name: 'small.png', mimeType: 'image/png', buffer: GRAD_BUF });
  await page.waitForFunction(() => !!window.__diag.toastAt || !!window.__diag.chipSeen, null, { timeout: 3000 });
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => ({
    chips: document.querySelectorAll('#attachmentChips .attachment-chip').length,
    toastAt: window.__diag.toastAt,
    toastText: window.__diag.toastText,
    attachCount: (window.__socratesAttachmentsBridge?.getSnapshot().attachments || []).length,
    timeline: window.__diag.timeline,
    logs: window.__diag.consoleLogs,
  }));
  console.log('[A1] result:', JSON.stringify(after));
  expect(after.chips).toBe(0);
  expect(after.attachCount).toBe(0);
  expect(after.toastAt).toBeTruthy();
  expect(after.toastAt).toBeLessThan(1000); // immediate feedback
});

test('A2: multimodal provider allows image upload', async ({ page }) => {
  await bootWithProviders(page, [
    { id: 'p-mm-on', label: 'Vision', url: 'https://example.com/v1', model: 'vision-model', hasKey: true, isActive: true, isBuiltIn: false, isMultimodal: true },
  ], { hasBeagleKey: false });

  const before = await page.evaluate(() => ({
    active: window.getActiveProvider ? { id: window.getActiveProvider()?.id, vision: window.getActiveProvider()?.vision } : null,
  }));
  console.log('[A2] active provider before upload:', JSON.stringify(before));
  expect(before.active).toEqual({ id: 'p-mm-on', vision: true });

  await page.locator('#attachInput').setInputFiles({ name: 'small.png', mimeType: 'image/png', buffer: GRAD_BUF });
  await page.waitForFunction(() => {
    const s = window.__socratesAttachmentsBridge?.getSnapshot();
    return s && s.attachments.length > 0 && s.attachments[0].pending === false;
  }, null, { timeout: 5000 });

  const after = await page.evaluate(() => ({
    chips: document.querySelectorAll('#attachmentChips .attachment-chip').length,
    attachCount: (window.__socratesAttachmentsBridge?.getSnapshot().attachments || []).length,
  }));
  console.log('[A2] result:', JSON.stringify(after));
  expect(after.chips).toBe(1);
  expect(after.attachCount).toBe(1);
});

test('B1: mixed 1.9MB image (compression path) latency breakdown', async ({ page }) => {
  await bootWithProviders(page, [
    { id: 'p-mm-on', label: 'Vision', url: 'https://example.com/v1', model: 'vision-model', hasKey: true, isActive: true, isBuiltIn: false, isMultimodal: true },
  ], { hasBeagleKey: false });

  await injectPerfWatchers(page);
  await page.evaluate(() => { window.__diag.t0 = performance.now(); });

  const t0 = Date.now();
  await page.locator('#attachInput').setInputFiles({ name: 'mixed.png', mimeType: 'image/png', buffer: MIXED_BUF });
  await page.waitForFunction(() => {
    const s = window.__socratesAttachmentsBridge?.getSnapshot();
    return s && (s.attachments.length === 0 || (s.attachments[0] && s.attachments[0].pending === false));
  }, null, { timeout: 15000 });
  await page.waitForTimeout(300);

  const report = await page.evaluate(() => ({
    chipSeen: window.__diag.chipSeen,
    chipPendingAt: window.__diag.chipPending,
    chipSettledAt: window.__diag.chipSettled,
    toastAt: window.__diag.toastAt,
    toastText: window.__diag.toastText,
    longtasks: window.__diag.longtasks,
    totalLongMs: (window.__diag.longtasks || []).reduce((a, b) => a + b.dur, 0),
    logs: window.__diag.consoleLogs,
    chips: document.querySelectorAll('#attachmentChips .attachment-chip').length,
    snapshot: (() => {
      const s = window.__socratesAttachmentsBridge?.getSnapshot();
      return s ? s.attachments.map((a) => ({ kind: a.kind, pending: a.pending, size: a.size, dataLen: (a.dataUrl || '').length })) : null;
    })(),
  }));
  console.log('[B1] report:', JSON.stringify(report), 'wallclock', Date.now() - t0, 'ms');
});

test('B4: photo 2.8MB (successful compression, OffscreenCanvas) latency breakdown', async ({ page }) => {
  await bootWithProviders(page, [
    { id: 'p-mm-on', label: 'Vision', url: 'https://example.com/v1', model: 'vision-model', hasKey: true, isActive: true, isBuiltIn: false, isMultimodal: true },
  ], { hasBeagleKey: false });

  await injectPerfWatchers(page);
  await page.evaluate(() => { window.__diag.t0 = performance.now(); });

  const t0 = Date.now();
  await page.locator('#attachInput').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PHOTO_BUF });
  await page.waitForFunction(() => {
    const s = window.__socratesAttachmentsBridge?.getSnapshot();
    return s && s.attachments.length > 0 && s.attachments[0].pending === false;
  }, null, { timeout: 20000 });
  await page.waitForTimeout(300);

  const report = await page.evaluate(() => ({
    chipPendingAt: window.__diag.chipPending,
    chipSettledAt: window.__diag.chipSettled,
    longtasks: window.__diag.longtasks,
    totalLongMs: (window.__diag.longtasks || []).reduce((a, b) => a + b.dur, 0),
    snapshot: (() => {
      const s = window.__socratesAttachmentsBridge?.getSnapshot();
      return s ? s.attachments.map((a) => ({ kind: a.kind, pending: a.pending, size: a.size, dataLen: (a.dataUrl || '').length, mime: a.mime })) : null;
    })(),
  }));
  console.log('[B4] report:', JSON.stringify(report), 'wallclock', Date.now() - t0, 'ms');
});

test('B5: photo 2.8MB with OffscreenCanvas DISABLED (legacy sync path)', async ({ page }) => {
  await page.addInitScript(() => {
    try { delete window.OffscreenCanvas; } catch (_) { window.OffscreenCanvas = undefined; }
    try { delete window.createImageBitmap; } catch (_) { window.createImageBitmap = undefined; }
  });
  await bootWithProviders(page, [
    { id: 'p-mm-on', label: 'Vision', url: 'https://example.com/v1', model: 'vision-model', hasKey: true, isActive: true, isBuiltIn: false, isMultimodal: true },
  ], { hasBeagleKey: false });

  const env = await page.evaluate(() => ({
    hasOffscreen: typeof OffscreenCanvas !== 'undefined',
    hasBitmap: typeof createImageBitmap === 'function',
  }));
  console.log('[B5] env:', JSON.stringify(env));

  await injectPerfWatchers(page);
  await page.evaluate(() => { window.__diag.t0 = performance.now(); });

  const t0 = Date.now();
  await page.locator('#attachInput').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PHOTO_BUF });
  await page.waitForFunction(() => {
    const s = window.__socratesAttachmentsBridge?.getSnapshot();
    return s && s.attachments.length > 0 && s.attachments[0].pending === false;
  }, null, { timeout: 30000 });
  await page.waitForTimeout(300);

  const report = await page.evaluate(() => ({
    chipPendingAt: window.__diag.chipPending,
    chipSettledAt: window.__diag.chipSettled,
    longtasks: window.__diag.longtasks,
    totalLongMs: (window.__diag.longtasks || []).reduce((a, b) => a + b.dur, 0),
    snapshot: (() => {
      const s = window.__socratesAttachmentsBridge?.getSnapshot();
      return s ? s.attachments.map((a) => ({ kind: a.kind, pending: a.pending, size: a.size, dataLen: (a.dataUrl || '').length, mime: a.mime })) : null;
    })(),
  }));
  console.log('[B5] report:', JSON.stringify(report), 'wallclock', Date.now() - t0, 'ms');
});

test('B3: pure-noise 4.3MB image (compression fail path) latency breakdown', async ({ page }) => {
  await bootWithProviders(page, [
    { id: 'p-mm-on', label: 'Vision', url: 'https://example.com/v1', model: 'vision-model', hasKey: true, isActive: true, isBuiltIn: false, isMultimodal: true },
  ], { hasBeagleKey: false });

  await injectPerfWatchers(page);
  await page.evaluate(() => { window.__diag.t0 = performance.now(); });

  const t0 = Date.now();
  await page.locator('#attachInput').setInputFiles({ name: 'noise.png', mimeType: 'image/png', buffer: NOISE_BUF });
  await page.waitForFunction(() => {
    const s = window.__socratesAttachmentsBridge?.getSnapshot();
    return s && (s.attachments.length === 0 || (s.attachments[0] && s.attachments[0].pending === false));
  }, null, { timeout: 20000 });
  await page.waitForTimeout(300);

  const report = await page.evaluate(() => ({
    chipSeen: window.__diag.chipSeen,
    chipPendingAt: window.__diag.chipPending,
    chipSettledAt: window.__diag.chipSettled,
    toastAt: window.__diag.toastAt,
    toastText: window.__diag.toastText,
    longtasks: window.__diag.longtasks,
    totalLongMs: (window.__diag.longtasks || []).reduce((a, b) => a + b.dur, 0),
    logs: window.__diag.consoleLogs,
    chips: document.querySelectorAll('#attachmentChips .attachment-chip').length,
    snapshot: (() => {
      const s = window.__socratesAttachmentsBridge?.getSnapshot();
      return s ? s.attachments.map((a) => ({ kind: a.kind, pending: a.pending, size: a.size, dataLen: (a.dataUrl || '').length })) : null;
    })(),
  }));
  console.log('[B3] report:', JSON.stringify(report), 'wallclock', Date.now() - t0, 'ms');
});
