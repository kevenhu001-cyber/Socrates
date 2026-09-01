// e2e/inline-handlers.spec.mjs — Wave -1 / C4
// Spec 2/6: every function name referenced from index.html's event-handler
// contract (originally inline `on{event}="..."`, now `data-action="..."`)
// must resolve on `window.*` at runtime. This is the load-bearing invariant
// from the plan's §5 — if any extraction deletes a bridge binding, this
// catches it.
//
// Strategy: parse `data-action(-{eventType})?="..."` strings from the
// built dist/index.html, extract action tokens, then verify each
// non-built-in token resolves as a function on `window.<name>`.
// Also assert that zero legacy `on{event}="..."` attributes remain.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp } from './_mock-api.mjs';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtmlPath = resolve(__dirname, '..', 'dist', 'index.html');

// Regex to capture event-handler attribute values from index.html.
// Legacy `on{event}="..."` attributes (should be zero after C4).
const LEGACY_RE = /\b(?:onclick|oninput|onchange|onsubmit|onkeydown|onfocus)="([^"]+)"/g;
// data-action attributes that carry handler names (NOT data-action-submit,
// data-action-self-only, data-action-guard, data-action-arg, data-action-keys).
const DATA_ACTION_RE = /\bdata-action(?:-input|-keydown|-change|-focus)?="([^"]+)"/g;

// Delegate.js built-in actions that are implemented inside delegate.js
// itself and never expected as window.* bindings. Also includes actions
// handled directly by React components (not via delegate.js → window.*).
const BUILTIN_ACTIONS = new Set([
  '__stop', 'preventDefault', 'select', 'blur',
]);

/**
 * Parse a single action spec (e.g. "closeMorePopover", "onFindInput:value")
 * and return the action name (part before `:`).
 */
function parseActionSpec(spec) {
  const trimmed = spec.trim();
  if (!trimmed) return null;
  const colonIdx = trimmed.indexOf(':');
  const name = colonIdx >= 0 ? trimmed.slice(0, colonIdx) : trimmed;
  return name || null;
}

/**
 * Extract data-action function names from built index.html.
 * Returns:
 *   - names: unique action names that should resolve on window.*
 *   - legacyCount: number of legacy on{event}="..." attributes found
 */
function extractActionFnNames(html) {
  const names = new Set();

  // Collect from data-action family.
  for (const match of html.matchAll(DATA_ACTION_RE)) {
    const value = match[1];
    for (const part of value.split(';')) {
      const name = parseActionSpec(part);
      if (name && !BUILTIN_ACTIONS.has(name)) {
        names.add(name);
      }
    }
  }

  // Count legacy inline handlers (should be zero).
  const legacyCount = [...html.matchAll(LEGACY_RE)].length;

  return { names: [...names].sort(), legacyCount };
}

test('no legacy inline event attributes remain in built index.html', async () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const { legacyCount } = extractActionFnNames(html);
  expect(legacyCount, 'expected zero legacy on{event}="..." attributes (C4 invariant)').toBe(0);
});

test('every data-action function name resolves on window.fn at runtime', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => document.documentElement.dataset.bootState === 'app',
    null,
    { timeout: 15_000 },
  ).catch(() => {});
  await page.waitForTimeout(500);

  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const { names } = extractActionFnNames(html);

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
    console.error('Missing data-action window bindings (' + missing.length + '):');
    for (const [n, t] of missing) console.error(`  ${n} → ${t}`);
  }
  expect(missing, `${missing.length}/${names.length} data-action bindings missing on window`).toEqual([]);
});
