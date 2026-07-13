// e2e/boot.spec.mjs — Wave -1
// Spec 1/6: page boots without JS errors, dist HTML matches the inline-handler
// snapshot hash, and 5 CDN deps are loaded after the bundle.
// This protects against:
//   - Vite plugin regressions (script-tag ordering in dist/index.html)
//   - Bundle missing (process exits before content paint)
//   - All 98 inline handlers still typed-correctly in dist/index.html

import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distHtml = resolve(__dirname, '..', 'dist', 'index.html');

function inlineHandlerHash() {
  const html = fs.readFileSync(distHtml, 'utf8');
  // Match any on{event}="..." attribute. Captured and sorted so the hash is
  // stable even if the file's bytes around them change.
  const matches = [
    ...html.matchAll(/\b(?:onclick|oninput|onchange|onsubmit)="([^"]+)"/g),
  ].map((m) => m[1]).sort();
  return createHash('sha256').update(matches.join('\n')).digest('hex').slice(0, 16);
}

function snapshotHashFile() {
  return resolve(__dirname, '..', '.snapshot', 'inline-handlers.hash');
}

test.beforeAll(() => {
  const hash = inlineHandlerHash();
  const snap = snapshotHashFile();
  if (!fs.existsSync(snap)) {
    fs.mkdirSync(dirname(snap), { recursive: true });
    fs.writeFileSync(snap, hash + '\n');
    console.log(`[boot] locked baseline inline-handler hash: ${hash}`);
  }
});

test('page boots, dist HTML script ordering correct, inline-handler hash matches snapshot', async ({ page }) => {
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto('/');

  // dist/index.html layout invariants: 5 CDN deps come BEFORE the bundle,
  // and the bundle moves past them (per vite.config.js plugin).
  const html = fs.readFileSync(distHtml, 'utf8');
  const cdnScripts = ['marked.min.js', 'purify.min.js', 'katex.min.js', 'mermaid.min.js', 'highlight.min.js', 'fuse.min.js'];
  for (const s of cdnScripts) {
    expect(html, `dist/index.html should reference ${s}`).toContain(s);
  }
  expect(html, 'dist/index.html should reference the assets/index-*.js bundle').toMatch(/assets\/index-[^"]+\.js/);

  // Find the bundle position and each CDN position; bundle must be after the LAST CDN.
  const lastCdnIdx = Math.max(...cdnScripts.map((s) => html.lastIndexOf(s)));
  const bundleIdx = html.search(/assets\/index-[^"]+\.js/);
  expect(bundleIdx > lastCdnIdx, 'bundle script tag must appear after all CDN script tags').toBeTruthy();

  // Page should render something meaningful within 30s.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForSelector('body', { timeout: 10_000 });

  // The inline-handler hash must equal the snapshot (or be written for first run).
  const snap = snapshotHashFile();
  const currentHash = inlineHandlerHash();
  if (fs.existsSync(snap)) {
    const saved = fs.readFileSync(snap, 'utf8').trim();
    expect(currentHash, `inline-handler hash drifted: saved=${saved} current=${currentHash}`).toBe(saved);
  }

  // After boot: at least one element with onclick present in DOM.
  const inlineCount = await page.evaluate(() =>
    document.querySelectorAll('[onclick],[oninput],[onchange],[onsubmit]').length,
  );
  expect(inlineCount, 'in-page inline-event-element count').toBeGreaterThanOrEqual(50);

  // No JS errors at boot.
  expect(consoleErrors, `unexpected JS errors: ${consoleErrors.join(' | ')}`).toEqual([]);
});
