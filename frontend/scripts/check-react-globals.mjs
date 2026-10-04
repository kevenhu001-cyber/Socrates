#!/usr/bin/env node
/*
 * scripts/check-react-globals.mjs — React→legacy global coupling ratchet.
 *
 * src/react/legacy/gateway.ts states the contract: React code MUST NOT read
 * window.* directly; the typed gateway is the only allowed boundary. In
 * practice React also reads the per-domain `window.__socrates*Bridge` objects
 * (the bridge infrastructure itself) and ordinary browser APIs (window.location,
 * window.addEventListener, …). Those are legitimate; everything else is a
 * hidden legacy-global coupling that this check counts and freezes.
 *
 * Counts may only go DOWN. If the count grows past the baseline the check
 * fails, so a new `window.<legacyFn>` read in React cannot land unnoticed.
 * Shrink the baseline with --update after an intentional reduction.
 *
 * Usage:  node scripts/check-react-globals.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const REACT = join(FRONTEND, 'src', 'react');
const BASELINE = join(FRONTEND, 'scripts', 'react-globals.baseline.json');
const UPDATE = process.argv.includes('--update');

/* Files allowed to touch window.* by design: the gateway is the boundary. */
const ALLOWED_FILES = new Set(['legacy/gateway.ts']);

/* Ordinary browser APIs — not part of the app's legacy global surface. */
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

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function collect() {
  const offenders = [];
  for (const file of walk(REACT)) {
    const rel = relative(REACT, file).split(sep).join('/');
    if (ALLOWED_FILES.has(rel)) continue;
    const text = normaliseWindowAccess(stripComments(readFileSync(file, 'utf8')));
    for (const m of text.matchAll(/window\.([A-Za-z_$][\w$]*)/g)) {
      const id = m[1];
      if (BROWSER.has(id)) continue;
      if (id.startsWith('__socrates')) continue; /* bridge infrastructure */
      offenders.push({ file: `src/react/${rel}`, id });
    }
  }
  return offenders;
}

function main() {
  const offenders = collect();
  const baseline = existsSync(BASELINE)
    ? JSON.parse(readFileSync(BASELINE, 'utf8'))
    : null;

  if (!baseline || UPDATE) {
    const count = baseline && typeof baseline.count === 'number'
      ? Math.min(baseline.count, offenders.length)
      : offenders.length;
    writeFileSync(BASELINE, JSON.stringify({
      count,
      note: 'React direct legacy-global reads. May only go down. Run with --update after an intentional reduction.',
      generatedBy: 'check-react-globals.mjs --update',
    }, null, 2) + '\n');
    console.log(`react-globals: baseline ${baseline ? 'updated' : 'written'} (count=${count}).`);
    if (offenders.length) {
      console.log('Current offenders:');
      for (const o of offenders) console.log(`  - ${o.file}: window.${o.id}`);
    }
    return;
  }

  if (offenders.length > baseline.count) {
    console.error('react-globals check FAILED:');
    console.error(`  React direct legacy-global reads: ${offenders.length} > baseline ${baseline.count} (+${offenders.length - baseline.count}).`);
    for (const o of offenders) console.error(`  - ${o.file}: window.${o.id}`);
    console.error('  Route the new read through src/react/legacy/gateway.ts instead.');
    process.exitCode = 1;
  } else {
    console.log(`react-globals check passed (${offenders.length}/${baseline.count} allowed).`);
  }
}

main();
