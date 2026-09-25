#!/usr/bin/env node
/*
 * scripts/gen-csp-hashes.mjs — single source of truth for the Content
 * Security Policy.
 *
 * Why this exists
 * ---------------
 * Before 2026-09-25 the policy lived in exactly one place (helmet, in
 * `server/src/app.ts`) and had two defects that a review caught:
 *
 *   1. The `script-src` hash allow-list was hand-maintained, with a comment
 *      warning "if you edit that script you MUST recompute the hash here".
 *      That warning had already fired: index.html carried TWO inline
 *      scripts while app.ts pinned ONE hash, matching neither. Every inline
 *      script was refused wherever Express served the bundle.
 *
 *   2. In production nginx — not Express — serves the SPA from
 *      /var/www/app.topodrive.top, so the helmet header never reached the
 *      document that actually needed it. The SPA shipped with no CSP.
 *
 * Fixing (2) means the policy must exist in an nginx header too, which
 * would have created a *second* hand-synced copy of the same hashes. So
 * this script owns the policy and emits every consumer from it:
 *
 *   server/src/generated/cspInlineHashes.ts  → imported by helmet in app.ts
 *   ops/nginx/csp-spa.conf                   → `include`d by the SPA vhost
 *
 * Usage
 * -----
 *   node scripts/gen-csp-hashes.mjs           # verify (default, CI mode)
 *   node scripts/gen-csp-hashes.mjs --update  # rewrite after editing index.html
 *
 * Exit codes: 0 = in sync / written, 1 = drifted (CI failure).
 * Wired into `npm run lint` in frontend/, so a change to index.html that
 * invalidates a hash fails the merge gate instead of production.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const INDEX_HTML = `${ROOT}frontend/index.html`;
/* Emitted as TypeScript rather than JSON on purpose: `tsc` copies imported
 * .json into outDir only under resolveJsonModule and the exact include
 * globs, which makes `server/dist/` quietly depend on tsconfig trivia. A
 * .ts module always compiles and is typed at the point of use. */
const OUT_TS = `${ROOT}server/src/generated/cspInlineHashes.ts`;
const OUT_NGINX = `${ROOT}ops/nginx/csp-spa.conf`;

const update = process.argv.includes('--update');

/* ─── Canonical policy ────────────────────────────────────────────────
 *
 * Every non-'self' entry needs a live consumer named here. The list was
 * trimmed on 2026-09-25: cdn.jsdelivr.net (script-src + style-src) and
 * fonts.googleapis.com / fonts.gstatic.com (style-src + font-src) were
 * removed because P_perf-self-host moved marked / DOMPurify / KaTeX /
 * highlight.js / fuse.js to bundled npm imports and mermaid / echarts /
 * plotly to dynamic imports of vendored UMD files. index.html states
 * outright that nothing on the page depends on those hosts, so the policy
 * was granting a third-party script-execution surface for a dependency
 * that no longer existed.
 *
 * ── Why script-src carries 'unsafe-inline' ──────────────────────────
 *
 * The first version of this policy used hashes only, with no
 * 'unsafe-inline'. Running the Playwright suite against it (the e2e static
 * server now serves this exact header — see frontend/e2e/dist-server.mjs)
 * failed 23 specs, all of them visualization-related:
 *
 *     [BROWSER ERROR] Executing inline script violates the following
 *     Content Security Policy directive 'script-src 'self' …'
 *
 * Cause: an `<iframe srcdoc>` INHERITS the embedding document's CSP. The viz
 * cards render model-authored HTML — plot cards, GeoGebra embeds, the
 * visualization templates — as srcdoc documents whose scripts are inline by
 * construction. A hash-only parent policy blocks every one of them, so the
 * card never leaves its `loading` state. `sandbox="allow-scripts"` does not
 * change this: CSP inheritance follows the local scheme (srcdoc / blob: /
 * data:), not the origin. Shipping the hash-only policy would have broken
 * every interactive visualization in production.
 *
 * What this costs: inline script injected into the SPA document is no longer
 * blocked by CSP. That is a real reduction against the hash-only ideal, and
 * it is why the hashes below are still emitted and still checked for drift —
 * they are needed the moment the parent policy can be tightened. Note that a
 * policy may not carry both: when hashes are present browsers IGNORE
 * 'unsafe-inline', which is why script-src lists one or the other and not
 * both.
 *
 * What the policy still buys, versus the nothing that shipped before it:
 *   - script-src 'self'   blocks <script src="https://evil/"> outright
 *   - object-src 'none'   no Flash/applet/plugin vectors
 *   - frame-ancestors     'none' — the app cannot be framed (clickjacking)
 *   - base-uri 'self'     a <base> injection cannot re-target relative URLs
 *   - form-action 'self'  a planted form cannot POST credentials off-origin
 *   - default-src 'self'  everything unlisted defaults to same-origin
 *
 * How to remove 'unsafe-inline': give the viz iframes a real same-origin URL
 * instead of srcdoc. A document fetched from a URL is governed by its OWN
 * response CSP rather than inheriting the parent's, so the viz route can send
 * a deliberately permissive sandboxed policy while the SPA keeps a hash-only
 * one. server/src/app.ts already does exactly this for published sites at
 * `/s/:token` ("default-src 'none'; …; sandbox"), so the pattern exists in the
 * codebase — the change is in frontend/src/render/viz.js, not here.
 */
const SCRIPT_SRC_INLINE = "'unsafe-inline'";

const DIRECTIVES = {
  'default-src': ["'self'"],
  // https://www.geogebra.org: the GeoGebra applet host, loaded as both a
  // script and an iframe by the visualization renderer.
  // 'unsafe-eval' is an explicit opt-in for Vite HMR and is added by app.ts at
  // runtime under ALLOW_DEV_EVAL=1 only — deliberately absent here.
  'script-src': ["'self'", SCRIPT_SRC_INLINE, 'https://www.geogebra.org'],
  // 'unsafe-inline' covers the small inline style block Vite emits.
  'style-src': ["'self'", "'unsafe-inline'"],
  'font-src': ["'self'", 'data:'],
  // `https:` is deliberate: assistant replies routinely contain markdown
  // images pointing at arbitrary hosts, and /api/image-search returns
  // third-party thumbnail URLs. Narrowing this silently breaks both.
  // Images cannot execute; residual risk is referrer leakage, already
  // bounded by Referrer-Policy: strict-origin-when-cross-origin.
  'img-src': ["'self'", 'data:', 'https:', 'blob:'],
  // fetch / XHR / EventSource. SSE from /api/chat/stream is same-origin;
  // outbound LLM calls are server-side and never touch the browser.
  'connect-src': ["'self'", 'https://www.geogebra.org'],
  'worker-src': ["'self'", 'blob:'],
  'frame-src': ["'self'", 'https://www.geogebra.org'],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'manifest-src': ["'self'"],
};

/* Match <script> elements that have no `src` attribute. The negative
 * lookahead must scan the whole attribute list, hence `[^>]*` twice. */
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

function cspHash(body) {
  // CSP hashes cover the element's exact text content, byte for byte —
  // no trimming, no normalisation. Whitespace changes the hash.
  return `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
}

const html = readFileSync(INDEX_HTML, 'utf8');
const hashes = [...html.matchAll(INLINE_SCRIPT)].map((m) => cspHash(m[1]));

if (hashes.length === 0 && !update) {
  console.error(
    '[csp] no inline <script> blocks found in frontend/index.html.\n' +
    '      That is either a win (nothing left to hash) or a broken regex.\n' +
    '      Run with --update to accept an empty list.',
  );
  process.exit(1);
}

/* ─── Renderers ──────────────────────────────────────────────────────── */

function renderTs() {
  return [
    '/* GENERATED FILE — do not edit by hand.',
    ' *',
    ' * Source:    frontend/index.html (inline <script> blocks)',
    ' * Generator: scripts/gen-csp-hashes.mjs',
    ' * Refresh:   node scripts/gen-csp-hashes.mjs --update',
    ' *',
    ' * CSP3 `script-src` hashes for the pre-paint inline scripts (theme',
    ' * resolution + boot-state marker). Hashing them is what lets the policy',
    " * stay off 'unsafe-inline'. `npm run lint` in frontend/ fails when this",
    ' * file drifts from index.html, so an edit to either side breaks the merge',
    ' * gate instead of breaking script execution in production.',
    ' */',
    'export const CSP_INLINE_SCRIPT_HASHES: readonly string[] = [',
    ...hashes.map((h) => `  "${h}",`),
    '] as const;',
    '',
  ].join('\n');
}

function renderNginx() {
  const policy = Object.entries(DIRECTIVES)
    .map(([name, sources]) => {
      /* Hashes are appended to script-src ONLY when the directive does not
       * already carry 'unsafe-inline'. Per CSP3 a browser ignores
       * 'unsafe-inline' whenever a hash or nonce is present, so emitting both
       * would silently re-activate hash-only enforcement and re-break every
       * viz iframe — the exact failure this policy was changed to avoid. The
       * hashes stay generated and drift-checked for the day the parent policy
       * can drop 'unsafe-inline' (see the note on DIRECTIVES). */
      const values = name === 'script-src' && !sources.includes(SCRIPT_SRC_INLINE)
        ? [...sources, ...hashes]
        : sources;
      return `${name} ${values.join(' ')}`;
    })
    .join('; ');

  return [
    '# GENERATED FILE — do not edit by hand.',
    '#',
    '# Source:    scripts/gen-csp-hashes.mjs (+ frontend/index.html hashes)',
    '# Refresh:   node scripts/gen-csp-hashes.mjs --update',
    '#',
    '# Content-Security-Policy for the SPA vhost (app.topodrive.top).',
    '#',
    '# Why this file is needed: production serves the bundle from',
    '# /var/www/app.topodrive.top via nginx, so the helmet CSP that',
    "# server/src/app.ts sets never reaches the SPA document — it only",
    '# covers api.topodrive.top and hosts where Express serves the bundle',
    '# directly. Until 2026-09-25 that meant the shipped SPA had no CSP at',
    '# all, which README\'s security section described as "recommended for',
    '# production ... the operator is expected to set headers at the nginx',
    '# layer" without any config to do it.',
    '#',
    '# Usage: `include` this file inside every location block of the SPA',
    '# vhost that serves HTML. nginx `add_header` does NOT inherit into a',
    '# nested location that declares its own add_header, so it must be',
    '# repeated per location rather than set once at server level.',
    '#',
    '# frame-ancestors is present here and cannot be expressed by a <meta>',
    '# CSP, which is the other reason this lives at the edge.',
    '',
    `add_header Content-Security-Policy "${policy}" always;`,
    '',
  ].join('\n');
}

/* ─── Write or verify ────────────────────────────────────────────────── */

const artifacts = [
  { path: OUT_TS, label: 'server/src/generated/cspInlineHashes.ts', body: renderTs() },
  { path: OUT_NGINX, label: 'ops/nginx/csp-spa.conf', body: renderNginx() },
];

if (update) {
  for (const { path, label, body } of artifacts) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body, 'utf8');
    console.log(`[csp] wrote ${label}`);
  }
  console.log(`[csp] ${hashes.length} inline script hash(es):`);
  for (const h of hashes) console.log(`  ${h}`);
  process.exit(0);
}

const drifted = [];
for (const { path, label, body } of artifacts) {
  if (!existsSync(path)) { drifted.push(`${label} (missing)`); continue; }
  if (readFileSync(path, 'utf8') !== body) drifted.push(label);
}

if (drifted.length > 0) {
  console.error(
    '[csp] DRIFT: generated CSP artifacts are stale:\n' +
    drifted.map((d) => `        - ${d}`).join('\n') + '\n' +
    '      Serving the SPA could refuse its own inline scripts.\n' +
    '      Fix with: node scripts/gen-csp-hashes.mjs --update',
  );
  console.error(`      expected hashes: ${hashes.join(', ') || '(none)'}`);
  process.exit(1);
}

console.log(`[csp] in sync (${hashes.length} inline script hash(es), ${artifacts.length} artifacts)`);
