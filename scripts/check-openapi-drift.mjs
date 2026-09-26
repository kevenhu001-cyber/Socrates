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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_TS = join(ROOT, 'server/src/app.ts');
const ROUTES_DIR = join(ROOT, 'server/src/routes');
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
  return p
    .replace(/\/+/g, '/')
    .replace(/:([A-Za-z_][\w]*)/g, '{p}')
    .replace(/\{[^}/]+\}/g, '{p}')
    .replace(/\/+$/, '') || '/';
}

/* ── 1. implemented routes ───────────────────────────────────────── */
const appSrc = readFileSync(APP_TS, 'utf8');

// name → routes/<file> for every router import (default import name only;
// named siblings like `, { githubWebhookHandler }` are handlers, not routers)
const importToFile = new Map();
for (const m of appSrc.matchAll(/import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s+'\.\/routes\/([^']+)\.js'/g)) {
  importToFile.set(m[1], join(ROUTES_DIR, m[2]));
}

function resolveRouterFile(name) {
  const base = importToFile.get(name);
  if (!base) return null;
  for (const ext of ['.ts', '.js']) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

// prefix -> [routerName, ...]
const mounts = [];
for (const m of appSrc.matchAll(/app\.use\(\s*'([^']+)'([^;]*?)\)\s*;?/gs)) {
  const prefix = m[1];
  const args = m[2];
  for (const ident of args.matchAll(/\b([A-Za-z_]\w*)\b/g)) {
    if (importToFile.has(ident[1])) mounts.push({ prefix, router: ident[1] });
  }
}

const implemented = new Set(); // 'METHOD /path'

// direct app.METHOD('/api/...') routes
for (const m of appSrc.matchAll(new RegExp(`app\\.(${METHOD_RE})\\(\\s*'([^']+)'`, 'g'))) {
  implemented.add(`${m[1].toUpperCase()} ${normPath(m[2])}`);
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

// A Router() file never mounted from app.ts is dead surface — worth seeing.
const allRouteFiles = readdirSync(ROUTES_DIR).filter((f) => /\.(ts|js)$/.test(f));
for (const f of allRouteFiles) {
  const full = join(ROUTES_DIR, f);
  if (!mountedFiles.has(full) && /const\s+\w+\s*=\s*Router\(/.test(readFileSync(full, 'utf8'))) {
    console.warn(`warn: ${f} defines a Router but is not mounted from app.ts`);
  }
}

/* ── 2. spec paths ───────────────────────────────────────────────── */
const specLines = readFileSync(SPEC, 'utf8').split('\n');
const spec = new Set();
let inPaths = false;
let curPath = null;
for (const line of specLines) {
  if (/^paths:\s*$/.test(line)) { inPaths = true; continue; }
  if (inPaths && /^\S/.test(line)) { inPaths = false; break; }
  if (!inPaths) continue;
  const p = line.match(/^ {2}(\/\S*):\s*$/);
  if (p) { curPath = p[1]; continue; }
  const m = line.match(new RegExp(`^ {4}(${METHOD_RE}):`));
  if (m && curPath) spec.add(`${m[1].toUpperCase()} ${normPath(curPath)}`);
}

if (implemented.size < 50) fail(`impl extraction looks broken: only ${implemented.size} routes`);
if (spec.size < 50) fail(`spec extraction looks broken: only ${spec.size} entries`);

/* ── 3. diff + ratchet ───────────────────────────────────────────── */
const implementedNotInSpec = [...implemented].filter((r) => !spec.has(r)).sort();
const specNotImplemented = [...spec].filter((r) => !implemented.has(r)).sort();

if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify({
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
  }, null, 2) + '\n');
  console.log(`baseline written: ${implementedNotInSpec.length} undocumented, ${specNotImplemented.length} unimplemented`);
  process.exit(0);
}

const baseline = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, 'utf8'))
  : { implementedNotInSpec: [], specNotImplemented: [] };

const newUndocumented = implementedNotInSpec.filter((r) => !baseline.implementedNotInSpec.includes(r));
const newUnimplemented = specNotImplemented.filter((r) => !baseline.specNotImplemented.includes(r));
const staleUndoc = baseline.implementedNotInSpec.filter((r) => !implementedNotInSpec.includes(r));
const staleUnimp = baseline.specNotImplemented.filter((r) => !specNotImplemented.includes(r));

console.log(`implemented routes: ${implemented.size} · spec entries: ${spec.size}`);
console.log(`drift: ${implementedNotInSpec.length} undocumented · ${specNotImplemented.length} unimplemented (baseline: ${baseline.implementedNotInSpec.length} / ${baseline.specNotImplemented.length})`);

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
  console.error('\nBaseline entries that no longer reproduce (ratchet only shrinks — run --update):');
  [...staleUndoc, ...staleUnimp].forEach((r) => console.error(`  ${r}`));
}
if (bad) process.exit(1);
console.log('openapi drift: clean against baseline');
