#!/usr/bin/env node
/*
 * scripts/check-state-ownership.mjs — React→state-ownership ratchet.
 *
 * The app has one intended state entry point: src/store/index.ts, which
 * exposes typed selector hooks over the six domain namespaces
 * (session/kb/search/call/ui/exam). Everything else is plumbing that is
 * still in the way:
 *
 *   - the `window.__socrates*Bridge` globals, published by the bridge
 *     modules and read back across the tree. check-react-globals.mjs
 *     cannot see them: it skips every `window.__socrates*` identifier as
 *     "bridge infrastructure", so a new bridge read in React lands without
 *     failing anything. That exemption is why this check exists.
 *   - direct `stateStore.dispatch(...)` writes from React, carrying string
 *     keys the type system cannot check.
 *
 * This check counts both families inside src/react/** and freezes them.
 * Counts may only go DOWN. Route new state access through the typed hooks
 * in src/store/index.ts; a new bridge global or a new string-keyed dispatch
 * must not land unnoticed.
 *
 * A bridge module may touch the global it publishes — that is how it
 * installs itself. Reading a global the file does not itself publish is
 * counted separately as `foreignBridgeGlobals`, and that is the counter
 * the ratchet actually forbids: a bridge that reads another feature's
 * bridge is the coupling that keeps the feature graph tangled.
 *
 * Usage:  node scripts/check-state-ownership.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const REACT = join(FRONTEND, 'src', 'react');
const BASELINE = join(FRONTEND, 'scripts', 'state-ownership.baseline.json');
const UPDATE = process.argv.includes('--update');

/* Files allowed to touch the legacy state surface by design: the typed
 * gateway is the boundary, and the bridge modules are the publishers. */
const ALLOWED_FILES = new Set(['legacy/gateway.ts']);

/* Ordinary browser APIs — not part of the app's state surface. */
const BROWSER = new Set([
  'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'devicePixelRatio',
  'addEventListener', 'removeEventListener', 'dispatchEvent',
  'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask',
  'location', 'history', 'navigator', 'document', 'screen', 'frames', 'self', 'top', 'parent', 'name',
  'localStorage', 'sessionStorage', 'crypto', 'performance', 'isSecureContext', 'origin',
  'getComputedStyle', 'matchMedia', 'getSelection', 'scrollTo', 'scroll', 'scrollX', 'scrollY', 'scrollBy',
  'open', 'close', 'focus', 'blur', 'stop', 'print', 'postMessage', 'alert', 'confirm', 'prompt',
  'visualViewport', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
  'CustomEvent', 'Event', 'HTMLElement', 'Element', 'Image', 'Notification',
  'fetch', 'structuredClone', 'atob', 'btoa', 'DOMParser', 'XMLSerializer', 'TextEncoder', 'TextDecoder',
  'AbortController', 'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData',
]);

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, ' '));
}

/* Normalise the casts TS code uses so one `window\.X` pass sees them all:
   `(window as any).X`, `(window as Window).X`, and `window['X']`. */
function normaliseWindowAccess(text) {
  return text
    .replace(/\(\s*window\s+as\s+[^)]+\)/g, 'window')
    .replace(/window\s*\[\s*['"]([A-Za-z_$][\w$]*)['"]\s*\]/g, 'window.$1');
}

/* The line a match at `index` sits on. */
function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/* A file owns the globals it publishes: `window.X = …` or
 * `Object.assign(window.X, …)`. Ownership is decided by what the file
 * does, not by a list of file names — a renamed or relocated bridge module
 * keeps its exemption without the baseline having to be edited. */
function ownedGlobals(text) {
  const owned = new Set();
  for (const m of text.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) owned.add(m[1]);
  for (const m of text.matchAll(/Object\.assign\(\s*window\.([A-Za-z_$][\w$]*)/g)) owned.add(m[1]);
  return owned;
}

function collect() {
  const bridgeGlobals = [];
  const foreignBridgeGlobals = [];
  const directDispatches = [];

  for (const file of walk(REACT)) {
    const rel = relative(REACT, file).split(sep).join('/');
    if (ALLOWED_FILES.has(rel)) continue;
    const raw = readFileSync(file, 'utf8');
    const text = normaliseWindowAccess(stripComments(raw));
    const owned = ownedGlobals(text);
    const where = `src/react/${rel}`;

    for (const m of text.matchAll(/window\.([A-Za-z_$][\w$]*)/g)) {
      const id = m[1];
      if (BROWSER.has(id)) continue;
      /* The bridge family: `__socrates*Bridge` and the one bridge that
       * carries no suffix. check-react-globals.mjs treats all of these as
       * bridge infrastructure and skips them; this check counts them. */
      if (!id.startsWith('__socrates')) continue;
      const hit = { file: where, line: lineAt(text, m.index), id };
      bridgeGlobals.push(hit);
      if (!owned.has(id)) foreignBridgeGlobals.push(hit);
    }

    /* String-keyed writes through the legacy facade. `stateStore.dispatch`
     * takes a `{ type, payload }` object whose type is a bare string, so
     * the compiler cannot check it. */
    for (const m of text.matchAll(/(?:window\.)?stateStore\.dispatch\s*\(/g)) {
      directDispatches.push({ file: where, line: lineAt(text, m.index) });
    }
  }

  return { bridgeGlobals, foreignBridgeGlobals, directDispatches };
}

function main() {
  const counts = collect();
  const baseline = existsSync(BASELINE)
    ? JSON.parse(readFileSync(BASELINE, 'utf8'))
    : null;

  const keys = ['bridgeGlobals', 'foreignBridgeGlobals', 'directDispatches'];

  if (!baseline || UPDATE) {
    const next = {};
    for (const key of keys) {
      const previous = baseline?.[key];
      next[key] = typeof previous === 'number'
        ? Math.min(previous, counts[key].length)
        : counts[key].length;
    }
    writeFileSync(BASELINE, JSON.stringify({
      ...next,
      note: 'React-side coupling to the legacy bridge globals and the string-keyed stateStore facade. May only go down. Run with --update after an intentional reduction.',
      generatedBy: 'check-state-ownership.mjs --update',
    }, null, 2) + '\n');
    console.log(`state-ownership: baseline ${baseline ? 'updated' : 'written'} (${keys.map((k) => `${k}=${next[k]}`).join(', ')}).`);
    for (const key of keys) {
      if (!counts[key].length) continue;
      console.log(`Current ${key}:`);
      for (const o of counts[key]) console.log(`  - ${o.file}:${o.line}${o.id ? ` window.${o.id}` : ''}`);
    }
    return;
  }

  const failures = [];
  for (const key of keys) {
    const current = counts[key].length;
    const limit = baseline[key];
    if (typeof limit !== 'number') {
      failures.push(`baseline missing ${key}`);
      continue;
    }
    if (current > limit) {
      failures.push(
        `${key}: ${current} > baseline ${limit} (+${current - limit}). Route new state access through the typed hooks in src/store/index.ts.`,
      );
      for (const o of counts[key]) {
        failures.push(`  ${o.file}:${o.line}${o.id ? ` window.${o.id}` : ''}`);
      }
    }
  }

  if (failures.length) {
    console.error('state-ownership check FAILED:');
    for (const f of failures) console.error('  - ' + f);
    process.exitCode = 1;
    return;
  }

  console.log(
    `state-ownership check passed (${keys.map((k) => `${counts[k].length}/${baseline[k]}`).join(', ')} allowed).`,
  );
}

main();
