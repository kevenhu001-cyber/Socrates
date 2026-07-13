// e2e/inline-handlers.spec.mjs — Wave -1
// Spec 2/6: every function name called inline from index.html must resolve
// on `window.*` at runtime. This is the load-bearing invariant from the plan's
// §5 — if any extraction deletes a bridge binding, this catches it.
//
// Strategy: parse `on{event}="..."` strings from index.html, extract literal
// identifiers that look like function calls (followed by `(`), then verify
// each resolves on `window.<name>`.

import { test, expect } from '@playwright/test';
import { mockAuthedApp } from './_mock-api.mjs';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtmlPath = resolve(__dirname, '..', 'dist', 'index.html');

function extractInlineFnNames(html) {
  const handlers = [...html.matchAll(/\b(?:onclick|oninput|onchange|onsubmit)="([^"]+)"/g)].map((m) => m[1]);
  const names = new Set();
  // JS keywords — never real function names.
  const KEYWORDS = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
    'return', 'function', 'var', 'let', 'const', 'new', 'typeof', 'instanceof',
    'in', 'of', 'try', 'catch', 'finally', 'throw', 'class', 'extends', 'super',
    'this', 'true', 'false', 'null', 'undefined', 'async', 'await', 'yield',
    'import', 'export', 'default', 'delete', 'void',
  ]);
  // Built-in method names that the inline handlers use as `.method()` calls.
  // We DO want to verify these exist — `event.preventDefault`, `event.stopPropagation`,
  // `this.select` are all real callable names that must resolve on their object.
  // We just shouldn't try to verify them as top-level window bindings.
  const SKIP_TOP_LEVEL = new Set([
    'preventDefault', 'stopPropagation', 'stopImmediatePropagation',
    'select', 'click', 'focus', 'blur', 'value',
    'target', 'currentTarget', 'key', 'shiftKey', 'ctrlKey', 'metaKey', 'altKey',
    'submit', 'reset', 'remove', 'add', 'push',
  ]);

  for (const h of handlers) {
    // Tokenize: skip strings, skip comments, capture identifiers followed by `(`.
    let inStr = false, strCh = '', inLineComment = false, inBlockComment = false;
    let i = 0;
    while (i < h.length) {
      const c = h[i], n = h[i + 1];
      if (inLineComment) { if (c === '\n') inLineComment = false; i++; continue; }
      if (inBlockComment) { if (c === '*' && n === '/') { inBlockComment = false; i += 2; continue; } i++; continue; }
      if (inStr) {
        if (c === '\\') { i += 2; continue; }
        if (c === strCh) { inStr = false; strCh = ''; }
        i++; continue;
      }
      if (c === '/' && n === '/') { inLineComment = true; i += 2; continue; }
      if (c === '/' && n === '*') { inBlockComment = true; i += 2; continue; }
      if (c === '"' || c === "'") { inStr = true; strCh = c; i++; continue; }
      if (c === '`' )  { inStr = true; strCh = '`'; i++; continue; }
      if (/[A-Za-z_$]/.test(c)) {
        let j = i;
        while (j < h.length && /[A-Za-z0-9_$]/.test(h[j])) j++;
        const ident = h.slice(i, j);
        i = j;
        // Skip whitespace
        let k = i;
        while (k < h.length && /\s/.test(h[k])) k++;
        if (h[k] === '(') {
          if (KEYWORDS.has(ident)) continue;
          // Dotted: `event.preventDefault()` → check the property name.
          // We want to verify the leaf method is callable on its object.
          // However, for our purpose (verify window.<name> resolves),
          // these dotted calls DON'T need to be top-level. Skip them.
          if (ident.includes('.')) continue;
          if (SKIP_TOP_LEVEL.has(ident)) continue;
          names.add(ident);
        }
      } else {
        i++;
      }
    }
  }
  return [...names].sort();
}

test('every inline-event function name resolves on window.fn at runtime', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => document.documentElement.dataset.bootState === 'app',
    null,
    { timeout: 15_000 },
  ).catch(() => {});
  await page.waitForTimeout(500);

  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const names = extractInlineFnNames(html);

  const result = await page.evaluate((n) => {
    const out = {};
    for (const name of n) {
      try {
        const v = window[name];
        out[name] = (typeof v === 'function') ? 'fn' : (typeof v);
      } catch (e) {
        out[name] = 'threw:' + String(e);
      }
    }
    return out;
  }, names);

  const missing = Object.entries(result).filter(([, t]) => t !== 'fn');
  if (missing.length) {
    console.error('Missing inline-event window bindings (' + missing.length + '):');
    for (const [n, t] of missing) console.error(`  ${n} → ${t}`);
  }
  expect(missing, `${missing.length}/${names.length} inline-event bindings missing on window`).toEqual([]);
});
