#!/usr/bin/env node
// check-openapi-drift.mjs — fail when server routes and docs/api/openapi.yaml
// drift apart in EITHER direction.
//
// Why a ratchet and not a hard match:
//   The spec (119 documented paths) and the routers (~60 mounts, hundreds of
//   handlers) were written in different passes, so a real gap set already
//   exists. A hard diff would be red from day one and get ignored — exactly
//   the failure mode audit.baseline.json documents. So this script compares
//   the CURRENT diff against scripts/openapi.baseline.json:
//     - a NEW divergence (route added without spec entry, or spec path added
//       without implementation) fails CI;
//     - a baselined divergence that stops reproducing ALSO fails, so the
//       baseline can only shrink. Refresh with `--update`.
//
// Extraction model (deliberately regex-level; the server uses three fixed
// registration idioms and no dynamic mounts):
//   app.ts:  import xRouter from './routes/x.js'   → name → file map
//            app.use('/prefix', ..., xRouter)      → mount prefix
//            app.METHOD('/path', ...)              → direct route
//
//   The 2026-11-21 modularization moved the domain mounts out of app.ts into
//   server/src/routes/mountApiRoutes.ts (commit 123d6f43). A scanner that only
//   read app.ts saw 31 routes and declared its own extraction broken, so the
//   gate failed on a healthy tree. Both mount sources are scanned now, and a
//   router import is resolved relative to the file that imports it.
//   router:  const r = Router(...)                 → var name
//            r.METHOD('/sub', ...)                 → METHOD prefix+sub
//   spec:    paths: block → '  /path:' + '    method:'
//
// Normalisation: ':param' and '{param}' both become '{p}', trailing slashes
// collapse — Express matches both spellings by default.
//
// Usage: node scripts/check-openapi-drift.mjs [--update]
// Exit:  0 clean-or-baselined · 1 drift · 2 extraction error

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_TS = join(ROOT, 'server/src/app.ts');
const ROUTES_DIR = join(ROOT, 'server/src/routes');
const MOUNT_API_ROUTES = join(ROUTES_DIR, 'mountApiRoutes.ts');
const SPEC = join(ROOT, 'docs/api/openapi.yaml');
const BASELINE = join(ROOT, 'scripts/openapi.baseline.json');
const UPDATE = process.argv.includes('--update');

const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
const METHOD_RE = METHODS.join('|');

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(2);
}

function normPath(p) {
  return (
    p
      .replace(/\/+/g, '/')
      .replace(/:([A-Za-z_][\w]*)/g, '{p}')
      .replace(/\{[^}/]+\}/g, '{p}')
      .replace(/\/+$/, '') || '/'
  );
}

/* ── 1. implemented routes ───────────────────────────────────────── */

/* Every file that mounts domain routers. app.ts holds the few mounts that
 * stay at the app level; mountApiRoutes.ts holds the domain mounts the
 * modularization moved out. */
const MOUNT_SOURCES = [APP_TS, MOUNT_API_ROUTES].filter((f) => existsSync(f));

/* name → routes/<file> per mount source (default import name only; named
 * siblings like `, { githubWebhookHandler }` are handlers, not routers).
 * The import path is resolved relative to the importing file, because the two
 * sources sit at different depths (app.ts imports './routes/x.js',
 * mountApiRoutes.ts imports './x.js'). */
function routerImports(src, srcDir) {
  const map = new Map();
  for (const m of src.matchAll(/import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s+'(\.[^']+)\.js'/g)) {
    const base = resolve(srcDir, m[2]);
    // Only routers under server/src/routes are route files; anything else
    // imported here (middleware, lib helpers) is not a router.
    if (!base.startsWith(ROUTES_DIR + '/')) continue;
    map.set(m[1], base);
  }
  return map;
}

const implemented = new Set(); // 'METHOD /path'
const mounts = [];

for (const sourceFile of MOUNT_SOURCES) {
  const src = readFileSync(sourceFile, 'utf8');
  const srcDir = dirname(sourceFile);
  const importToFile = routerImports(src, srcDir);

  // app.use('/prefix', ..., xRouter) → mount prefix
  for (const m of src.matchAll(/app\.use\(\s*'([^']+)'([^;]*?)\)\s*;?/gs)) {
    const prefix = m[1];
    const args = m[2];
    for (const ident of args.matchAll(/\b([A-Za-z_]\w*)\b/g)) {
      if (importToFile.has(ident[1])) mounts.push({ prefix, router: ident[1] });
    }
  }

  // direct app.METHOD('/api/...') routes
  for (const m of src.matchAll(new RegExp(`app\\.(${METHOD_RE})\\(\\s*'([^']+)'`, 'g'))) {
    implemented.add(`${m[1].toUpperCase()} ${normPath(m[2])}`);
  }
}

/* Router name → file, across all mount sources. A name is unique in this
 * codebase (every mount source imports its own routers), so one flat map is
 * enough to resolve a mount to the file that defines it. */
const importToFile = new Map();
for (const sourceFile of MOUNT_SOURCES) {
  const src = readFileSync(sourceFile, 'utf8');
  for (const [name, base] of routerImports(src, dirname(sourceFile))) {
    importToFile.set(name, base);
  }
}

function resolveRouterFile(name) {
  const base = importToFile.get(name);
  if (!base) return null;
  for (const ext of ['.ts', '.js']) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

const routerRouteCache = new Map();
function routesInFile(file) {
  if (routerRouteCache.has(file)) return routerRouteCache.get(file);
  const src = readFileSync(file, 'utf8');
  const varMatch = src.match(/const\s+(\w+)\s*=\s*Router\(/);
  if (!varMatch) fail(`no Router() found in ${file}`);
  const v = varMatch[1];
  const found = [];
  const re = new RegExp(`\\b${v}\\.(${METHOD_RE})\\(\\s*'([^']+)'`, 'g');
  for (const m of src.matchAll(re)) found.push({ method: m[1].toUpperCase(), sub: m[2] });

  // Scan imported helpers for route registrations. Both subfolder helpers
  // (routes/chat/index.ts → ./stream.js, ./prepare/*.js) and sibling helpers
  // (routes/chat.ts → ./chat/stream.js in the pre-directory layout) count: a
  // router may delegate its paths to a `registerX(router)` helper. A helper
  // that creates its own Router() is a router file, not a delegate, and is
  // skipped — the `Router(` test also catches `createXRouter()` factories.
  const dir = dirname(file);
  for (const im of src.matchAll(/import\s+(?:\{[^}]*\}|\w+)\s+from\s+'(\.\/[^']+)\.js'/g)) {
    const importPath = im[1];
    for (const ext of ['.ts', '.js']) {
      const helper = join(dir, importPath + ext);
      if (existsSync(helper)) {
        const helperSrc = readFileSync(helper, 'utf8');
        if (/Router\(/.test(helperSrc)) continue;
        const helperRe = new RegExp(`\\b(?:${v}|router)\\.(${METHOD_RE})\\(\\s*'([^']+)'`, 'g');
        for (const m of helperSrc.matchAll(helperRe))
          found.push({ method: m[1].toUpperCase(), sub: m[2] });
      }
    }
  }

  routerRouteCache.set(file, found);
  return found;
}

const mountedFiles = new Set();
for (const { prefix, router } of mounts) {
  const file = resolveRouterFile(router);
  if (!file) {
    console.warn(`warn: mounted router '${router}' did not resolve to a routes file — skipped`);
    continue;
  }
  mountedFiles.add(file);
  for (const r of routesInFile(file)) {
    implemented.add(`${r.method} ${normPath(prefix + '/' + r.sub)}`);
  }
}

// Visit every domain so moving a router cannot hide an unmounted definition.
function warnAboutUnmountedRouters(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      warnAboutUnmountedRouters(file);
    } else if (
      entry.isFile() &&
      /\.(ts|js)$/.test(entry.name) &&
      !mountedFiles.has(file) &&
      /const\s+\w+\s*=\s*Router\(/.test(readFileSync(file, 'utf8'))
    ) {
      console.warn(
        `warn: ${relative(ROUTES_DIR, file)} defines a Router but is not mounted from app.ts`,
      );
    }
  }
}
warnAboutUnmountedRouters(ROUTES_DIR);

/* ── 2. spec paths ───────────────────────────────────────────────── */
const specLines = readFileSync(SPEC, 'utf8').split('\n');
const spec = new Set();
let inPaths = false;
let curPath = null;
for (const line of specLines) {
  if (/^paths:\s*$/.test(line)) {
    inPaths = true;
    continue;
  }
  if (inPaths && /^\S/.test(line)) {
    inPaths = false;
    break;
  }
  if (!inPaths) continue;
  const p = line.match(/^ {2}(\/\S*):\s*$/);
  if (p) {
    curPath = p[1];
    continue;
  }
  const m = line.match(new RegExp(`^ {4}(${METHOD_RE}):`));
  if (m && curPath) spec.add(`${m[1].toUpperCase()} ${normPath(curPath)}`);
}

if (implemented.size < 50) fail(`impl extraction looks broken: only ${implemented.size} routes`);
if (spec.size < 50) fail(`spec extraction looks broken: only ${spec.size} entries`);

/* ── 3. diff + ratchet ───────────────────────────────────────────── */
const implementedNotInSpec = [...implemented].filter((r) => !spec.has(r)).sort();
const specNotImplemented = [...spec].filter((r) => !implemented.has(r)).sort();

if (UPDATE) {
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        _comment: [
          'Route/spec drift accepted as of the recorded date. Consumed by',
          'scripts/check-openapi-drift.mjs, run by the Repo sanity CI job.',
          '',
          'Contract (same shape as audit.baseline.json):',
          '  - a divergence NOT listed here fails CI: new routes need spec entries,',
          '    new spec entries need implementations.',
          '  - a listed divergence that stops reproducing ALSO fails, so the list',
          '    can only shrink.',
          'Refresh with: node scripts/check-openapi-drift.mjs --update',
        ],
        recorded: new Date().toISOString().slice(0, 10),
        implementedNotInSpec,
        specNotImplemented,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `baseline written: ${implementedNotInSpec.length} undocumented, ${specNotImplemented.length} unimplemented`,
  );
  process.exit(0);
}

const baseline = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, 'utf8'))
  : { implementedNotInSpec: [], specNotImplemented: [] };

const newUndocumented = implementedNotInSpec.filter(
  (r) => !baseline.implementedNotInSpec.includes(r),
);
const newUnimplemented = specNotImplemented.filter((r) => !baseline.specNotImplemented.includes(r));
const staleUndoc = baseline.implementedNotInSpec.filter((r) => !implementedNotInSpec.includes(r));
const staleUnimp = baseline.specNotImplemented.filter((r) => !specNotImplemented.includes(r));

console.log(`implemented routes: ${implemented.size} · spec entries: ${spec.size}`);
console.log(
  `drift: ${implementedNotInSpec.length} undocumented · ${specNotImplemented.length} unimplemented (baseline: ${baseline.implementedNotInSpec.length} / ${baseline.specNotImplemented.length})`,
);

let bad = false;
if (newUndocumented.length) {
  bad = true;
  console.error('\nNEW routes without spec entries:');
  newUndocumented.forEach((r) => console.error(`  ${r}`));
}
if (newUnimplemented.length) {
  bad = true;
  console.error('\nNEW spec paths without implementation:');
  newUnimplemented.forEach((r) => console.error(`  ${r}`));
}
if (staleUndoc.length || staleUnimp.length) {
  bad = true;
  console.error(
    '\nBaseline entries that no longer reproduce (ratchet only shrinks — run --update):',
  );
  [...staleUndoc, ...staleUnimp].forEach((r) => console.error(`  ${r}`));
}
if (bad) process.exit(1);
console.log('openapi drift: clean against baseline');
