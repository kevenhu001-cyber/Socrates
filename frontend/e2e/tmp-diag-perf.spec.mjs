// tmp-diag-perf.spec.mjs — TEMPORARY step-by-step micro-benchmark of the
// image upload pipeline (read → fetch(dataUrl) → decode → encode ladder).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { ensureDiagPngs } from './tmp-gen-png.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
ensureDiagPngs();
const PHOTO_BUF = fs.readFileSync(resolve(__dirname, 'tmp-diag-photo.png'));
const MIXED_BUF = fs.readFileSync(resolve(__dirname, 'tmp-diag-mixed.png'));

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Access-Control-Allow-Origin': '*' },
  };
}

async function bootWithProviders(page, providers, cfg) {
  await mockAuthedApp(page);
  await page.route('**/tmp-img/photo.png', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PHOTO_BUF }));
  await page.route('**/tmp-img/mixed.png', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: MIXED_BUF }));
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

/* Replay the exact pipeline from attachments.js compressWithOffscreenCanvas,
   timing every stage. Runs entirely in-page. */
const PIPELINE_JS = `
  async function pipelineStep(label, fn) {
    const t = performance.now();
    const v = await fn();
    return { label, ms: Math.round(performance.now() - t), extra: v };
  }
  async function bench(url, { disableOffscreen } = {}) {
    const resp = await fetch(url);
    const blob = await resp.blob();
    if (!blob.size) throw new Error('empty blob from ' + url);
    // sanity: can an <img> element decode it?
    const canImgDecode = await new Promise((res) => {
      const el = new Image();
      el.onload = () => res(true);
      el.onerror = () => res(false);
      el.src = URL.createObjectURL(blob);
    });
    if (!canImgDecode) throw new Error('img decode FAILED for ' + url + ' blobSize=' + blob.size);
    const file = new File([blob], 'photo.png', { type: 'image/png' });
    const out = [];
    // 1. FileReader → dataUrl
    let dataUrl = '';
    out.push(await pipelineStep('readFileAsDataUrl', () => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => { dataUrl = String(r.result); res(dataUrl.length); };
      r.onerror = rej;
      r.readAsDataURL(file);
    })));
    if (disableOffscreen) {
      // legacy path: Image() decode + sync canvas toDataURL ladder
      const img = await new Promise((res, rej) => {
        const el = new Image();
        el.onload = () => res(el);
        el.onerror = () => rej(new Error('decode failed'));
        el.src = dataUrl;
      });
      out.push({ label: 'imgDecode', ms: 0, extra: { w: img.naturalWidth, h: img.naturalHeight } });
      const EDGE_STEPS = [2048, 1600, 1280, 1024, 800];
      const QUALITY_STEPS = [0.85, 0.75, 0.6, 0.45];
      for (const edge of EDGE_STEPS) {
        const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        for (const q of QUALITY_STEPS) {
          const t = performance.now();
          let o = '';
          try { o = canvas.toDataURL('image/webp', q); } catch (_) {}
          if (!o.startsWith('data:image/webp')) { try { o = canvas.toDataURL('image/jpeg', q); } catch (_) {} }
          out.push({ label: 'legacy.toDataURL', ms: Math.round(performance.now() - t), extra: { edge, q, len: o.length, hit: o.length <= 1900000 } });
          if (o && o.length <= 1900000) { return out; }
        }
      }
      return out;
    }
    // 2. fetch(dataUrl) + blob()
    out.push(await pipelineStep('fetch(dataUrl)', async () => {
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      return blob.size;
    }));
    // 3. createImageBitmap decode
    let bitmap;
    out.push(await pipelineStep('createImageBitmap', async () => {
      const blob = await (await fetch(dataUrl)).blob();
      bitmap = await createImageBitmap(blob);
      return { w: bitmap.width, h: bitmap.height };
    }));
    // 4. encode ladder (OffscreenCanvas)
    const EDGE_STEPS = [2048, 1600, 1280, 1024, 800];
    const QUALITY_STEPS = [0.85, 0.75, 0.6, 0.45];
    const srcW = bitmap.width, srcH = bitmap.height;
    for (const edge of EDGE_STEPS) {
      const scale = Math.min(1, edge / Math.max(srcW, srcH));
      const w = Math.max(1, Math.round(srcW * scale));
      const h = Math.max(1, Math.round(srcH * scale));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      for (const q of QUALITY_STEPS) {
        out.push(await pipelineStep('convertToBlob', async () => {
          const blob = await canvas.convertToBlob({ type: 'image/webp', quality: q });
          const len = await new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result || '').length);
            r.readAsDataURL(blob);
          });
          return { edge, q, blobBytes: blob.size, outLen: len, hit: len <= 1900000 };
        }));
      }
    }
    bitmap.close();
    return out;
  }
  window.__bench = bench;
`;

test('PERF: OffscreenCanvas pipeline step-by-step (photo 2.8MB)', async ({ page }) => {
  await bootWithProviders(page, [
    { id: 'p-mm-on', label: 'Vision', url: 'https://example.com/v1', model: 'vision-model', hasKey: true, isActive: true, isBuiltIn: false, isMultimodal: true },
  ], { hasBeagleKey: false });
  await page.addScriptTag({ content: PIPELINE_JS });
  const t0 = Date.now();
  const report = await page.evaluate(() => window.__bench('/tmp-img/photo.png'));
  console.log('[PERF-offscreen] wallclock', Date.now() - t0, 'ms');
  for (const step of report) console.log('[PERF-offscreen]', JSON.stringify(step));
  expect(report.length).toBeGreaterThan(3);
});

test('PERF: legacy sync pipeline step-by-step (photo 2.8MB)', async ({ page }) => {
  await page.addInitScript(() => {
    try { delete window.OffscreenCanvas; } catch (_) { window.OffscreenCanvas = undefined; }
    try { delete window.createImageBitmap; } catch (_) { window.createImageBitmap = undefined; }
  });
  await bootWithProviders(page, [
    { id: 'p-mm-on', label: 'Vision', url: 'https://example.com/v1', model: 'vision-model', hasKey: true, isActive: true, isBuiltIn: false, isMultimodal: true },
  ], { hasBeagleKey: false });
  await page.addScriptTag({ content: PIPELINE_JS });
  const t0 = Date.now();
  const report = await page.evaluate(() => window.__bench('/tmp-img/photo.png', { disableOffscreen: true }));
  console.log('[PERF-legacy] wallclock', Date.now() - t0, 'ms');
  for (const step of report) console.log('[PERF-legacy]', JSON.stringify(step));
  /* Assert the legacy path was actually exercised end to end: read, decode,
     and at least one toDataURL rung that lands under the size cap. The old
     `report.length > 3` only held when the FIRST compression attempt missed,
     which depends on how well the synthetic fixture compresses — this
     gradient clears the cap on rung 1, so length is legitimately 3. */
  const labels = report.map((s) => s.label);
  expect(labels).toContain('readFileAsDataUrl');
  expect(labels).toContain('imgDecode');
  expect(labels).toContain('legacy.toDataURL');
  expect(report.some((s) => s.label === 'legacy.toDataURL' && s.extra && s.extra.hit)).toBe(true);
});

test('PERF: mixed 1.9MB image decode+encode only', async ({ page }) => {
  await bootWithProviders(page, [
    { id: 'p-mm-on', label: 'Vision', url: 'https://example.com/v1', model: 'vision-model', hasKey: true, isActive: true, isBuiltIn: false, isMultimodal: true },
  ], { hasBeagleKey: false });
  await page.addScriptTag({ content: PIPELINE_JS });
  const t0 = Date.now();
  const report = await page.evaluate(() => window.__bench('/tmp-img/mixed.png'));
  console.log('[PERF-mixed] wallclock', Date.now() - t0, 'ms');
  for (const step of report.slice(0, 6)) console.log('[PERF-mixed]', JSON.stringify(step));
  expect(report.length).toBeGreaterThan(3);
});
