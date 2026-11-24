#!/usr/bin/env node
/*
 * scripts/check-forwarding-shims.mjs — the migration must not grow new shells.
 *
 * Historically both trees used the same trick to avoid a rename:
 * a file whose whole body is `export * from './canonical.js'`. It keeps old
 * importers working (and, on the server, keeps `services/foo.ts` alive after
 * the real module moved to `services/<group>/foo.ts`), but every shell is a
 * second name for one module: two paths to review, two paths to grep, and a
 * stack trace that points at a file with no code in it.
 *
 * This ratchet started as a freeze (85 shells on 2026-10-17) and is now at
 * zero: the server's flat `services/*.ts` layer and the frontend's `.js`
 * wrappers were both retired. New code imports the canonical module, and any
 * new re-export-only file fails immediately.
 *
 * A file counts as a shell only when, after comments are stripped, its entire
 * body is re-export statements. Barrels (`index.ts`), type declarations and
 * vendor bundles are not counted.
 *
 * Usage:  node scripts/check-forwarding-shims.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const ROOTS = ['frontend/src', 'server/src'];
const SKIP_DIRS = new Set(['node_modules', 'vendor-files', 'generated', 'dist', '__snapshots__']);
const SOURCE_EXT = /\.(?:ts|tsx|js|mjs|cjs)$/;
const NOT_A_SHELL = /(?:^|\/)(?:index|main)\.[cm]?[jt]sx?$/;

/* One `export * from '…'` or `export { … } from '…'` statement. */
const RE_EXPORT = /^export\s+(?:\*|\{[^}]*\})\s+from\s+['"][^'"]+['"];?/;

function walk(dir, out) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path, out);
    } else if (SOURCE_EXT.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(path);
    }
  }
  return out;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

function isShell(file) {
  if (NOT_A_SHELL.test(file.split(sep).join('/'))) return false;
  let body = stripComments(readFileSync(file, 'utf8')).replace(/\s+/g, ' ').trim();
  if (!body) return false;
  let statements = 0;
  while (body) {
    const match = RE_EXPORT.exec(body);
    if (!match) return false;
    statements += 1;
    body = body.slice(match[0].length).trim();
  }
  return statements > 0;
}

const shells = [];
for (const root of ROOTS) {
  for (const file of walk(join(ROOT, root), [])) {
    if (isShell(file)) shells.push(relative(ROOT, file).split(sep).join('/'));
  }
}
shells.sort();

if (shells.length) {
  console.error('forwarding shims check FAILED: import canonical modules directly.');
  for (const shell of shells) console.error(`  ${shell}`);
  process.exitCode = 1;
} else {
  console.log('forwarding shims check passed (zero re-export-only files).');
}
