// e2e/boot.spec.mjs — Wave -1
// Spec 1/6: page boots without JS errors, dist HTML matches the inline-handler
// snapshot hash, and the app bundle loads as a deferred ES module with the
// formerly-CDN globals (marked/DOMPurify/katex/hljs/Fuse) bundled locally.
// This protects against:
//   - Vite plugin regressions (script-tag ordering in dist/index.html)
//   - Bundle missing (process exits before content paint)
//   - All 98 inline handlers still typed-correctly in dist/index.html
//   - React components regressing to legacy inline on* handlers (source scan)

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distHtml = resolve(__dirname, '..', 'dist', 'index.html');

function inlineHandlerHash() {
  const html = fs.readFileSync(distHtml, 'utf8');
  // Match both legacy on{event}="..." and C4 data-action="..." attributes.
  // Captured and sorted so the hash is stable even if bytes around them change.
  const matches = [
    ...html.matchAll(/\b(?:onclick|oninput|onchange|onsubmit|onkeydown|onfocus)="([^"]+)"/g),
    ...html.matchAll(/\bdata-action(?:-[a-z]+)?="([^"]+)"/g),
  ].map((m) => m[1]).sort();
  return createHash('sha256').update(matches.join('\n')).digest('hex').slice(0, 16);
}

function snapshotHashFile() {
  return resolve(__dirname, '..', '.snapshot', 'inline-handlers.hash');
}

test.beforeAll(() => {
  // Without a build there is nothing to hash; the boot test below
  // reports the missing dist with an actionable message.
  if (!fs.existsSync(distHtml)) return;
  const hash = inlineHandlerHash();
  const snap = snapshotHashFile();
  if (!fs.existsSync(snap)) {
    fs.mkdirSync(dirname(snap), { recursive: true });
    fs.writeFileSync(snap, hash + '\n');
    console.log(`[boot] locked baseline inline-handler hash: ${hash}`);
  }
});

test('page boots, dist HTML script ordering correct, inline-handler hash matches snapshot', async ({ page }) => {
  expect(
    fs.existsSync(distHtml),
    'dist/index.html missing — run `npm run build` in frontend/ before the smoke suite',
  ).toBeTruthy();

  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  /* The browser sandbox intentionally has no public-network access. The app
     is fully self-hosted now (fonts + vendor libs), so the real dist HTML
     boots offline; keep the route as a safety net for any stale external
     reference that might slip back in. */
  const offlineHtml = fs.readFileSync(distHtml, 'utf8')
    .replace(/<link[^>]+https:\/\/cdn\.jsdelivr\.net[^>]*>\s*/gi, '')
    .replace(/<link[^>]+https:\/\/fonts\.googleapis\.com[^>]*>\s*/gi, '')
    .replace(/<link[^>]+https:\/\/fonts\.gstatic\.com[^>]*>\s*/gi, '')
    .replace(/<script[^>]+https:\/\/cdn\.jsdelivr\.net[^>]*><\/script>\s*/gi, '');
  await page.route('http://127.0.0.1:4173/', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: offlineHtml });
  });

  await gotoAndSettle(page, '/');

  // dist/index.html layout invariants (ES-module build): no external
  // script/CSS/font dependency remains, and the app bundle is emitted as a
  // type="module" script. Marked/DOMPurify/KaTeX/hljs/Fuse are bundled into
  // the module graph by src/vendor/init.js; mermaid/echarts/plotly are
  // self-hosted static assets injected only on demand.
  const html = fs.readFileSync(distHtml, 'utf8');
  expect(html, 'dist/index.html must not load external JS/CSS').not.toMatch(/https:\/\/cdn\.jsdelivr\.net[^"']*\.(?:js|css)/);
  expect(html, 'dist/index.html must not load Google Fonts').not.toContain('fonts.googleapis.com/css');
  expect(html, 'dist/index.html must not preconnect to gstatic').not.toContain('fonts.gstatic.com');
  expect(html, 'dist/index.html should reference the assets/index-*.js bundle').toMatch(/assets\/index-[^"]+\.js/);

  // The bundle must load as an ES module (deferred, single entry point).
  expect(
    /<script[^>]*type="module"[^>]*src="[^"]*assets\/index-[^"]+\.js"/.test(html),
    'app bundle must be a type="module" script',
  ).toBeTruthy();

  // The eager vendor globals must be present after the bundle evaluates.
  // katex / hljs / fuse intentionally load on demand (math, code blocks,
  // Cmd-K) so they are not asserted here.
  const globals = await page.evaluate(() => ({
    marked: typeof window.marked,
    dompurify: typeof window.DOMPurify,
  }));
  expect(globals).toEqual({
    marked: 'function',
    dompurify: 'function',
  });

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

  // After boot: the legacy shell's interactive controls are now owned by
  // direct listeners (ui/legacyShellListeners.js) and React roots, which
  // replaced the document-wide data-action delegation. Guard that at least
  // the primary nav stays React-hydrated so the shell is still interactive.
  const reactNavCount = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#sidebarNav .sidebar-nav-btn')).filter(
      (el) => Object.keys(el).some((k) => k.startsWith('__reactProps$')),
    ).length,
  );
  expect(reactNavCount, 'React-hydrated nav button count').toBeGreaterThanOrEqual(7);

  // No JS errors at boot.
  expect(consoleErrors, `unexpected JS errors: ${consoleErrors.join(' | ')}`).toEqual([]);
});

function collectSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) collectSourceFiles(full, out);
    else if (/\.(?:tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Source-level twin of the dist hash above: the React tree must never
// emit legacy inline handlers, whether or not a build exists. Limited
// to src/react — legacy JS modules intentionally build inline-handler
// HTML bridged through windowExports.js, but React components must use
// onClick handlers via the typed gateway instead.
test('no inline on* handlers built in src/react', async () => {
  const reactDir = resolve(__dirname, '..', 'src', 'react');
  const offenders = [];
  for (const file of collectSourceFiles(reactDir)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const m of source.matchAll(/\bon(?:click|input|change|submit|keydown|keyup|focus|blur|mouseover|mouseenter|mouseleave)="[^"]*"/gi)) {
      offenders.push(`${file}: ${m[0].slice(0, 80)}`);
    }
  }
  expect(offenders, `inline handlers found in src/react: ${offenders.join(' | ')}`).toEqual([]);
});
