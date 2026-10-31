#!/usr/bin/env node
/*
 * scripts/check-action-pinning.mjs — every third-party GitHub Action must be
 * pinned to an immutable commit SHA.
 *
 * A tag reference (`actions/checkout@v4`) is a mutable pointer. Whoever can
 * move the tag controls the code that runs inside the workflow, with the
 * repository's token and secrets. Pinning to a commit SHA removes the
 * indirection; the release tag stays in a trailing comment so the upgrade
 * path is still reviewable in a diff.
 *
 * The baseline is shrink-only and starts at zero: the whole workflow tree
 * was pinned on 2026-10-31, so a new unpinned reference fails immediately.
 *
 * Local actions (`./.github/actions/foo`) and `docker://` images are not
 * GitHub Actions and are not checked.
 *
 * Usage:  node scripts/check-action-pinning.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = join(ROOT, 'scripts', 'action-pinning.baseline.json');
const UPDATE = process.argv.includes('--update');
const WORKFLOW_DIR = join(ROOT, '.github', 'workflows');

const SHA_RE = /^[0-9a-f]{40}$/;
/* `uses:` appears either as the first key of a list item (`- uses: …`) or as
 * a sibling key under a named step (`- name: …` / `  uses: …`). */
const USES_RE = /^(\s*(?:-\s*)?uses:\s*)([^\s#]+)(\s*)(#.*)?$/;

const files = existsSync(WORKFLOW_DIR)
  ? readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => join(WORKFLOW_DIR, name))
    .sort()
  : [];

const unpinned = [];
let total = 0;
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const match = USES_RE.exec(line);
    if (!match) return;
    const target = match[2];
    if (target.startsWith('./') || target.startsWith('docker://')) return;
    total += 1;
    const at = target.lastIndexOf('@');
    if (at <= 0) {
      unpinned.push({ file: relative(ROOT, file).split(sep).join('/'), line: index + 1, target });
      return;
    }
    const ref = target.slice(at + 1);
    if (!SHA_RE.test(ref)) {
      unpinned.push({ file: relative(ROOT, file).split(sep).join('/'), line: index + 1, target });
    }
  });
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;

function writeBaseline(next) {
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        unpinned: next.length,
        refs: next,
        note: 'GitHub Actions that are not pinned to a commit SHA. May only go down. Run with --update after an intentional reduction.',
        generatedBy: 'check-action-pinning.mjs --update',
      },
      null,
      2,
    ) + '\n',
  );
}

if (!baseline) {
  writeBaseline(unpinned);
  console.log(`action pinning: no baseline found — wrote scripts/action-pinning.baseline.json (${unpinned.length} unpinned of ${total}).`);
  console.log('Commit the baseline; growth beyond it now fails.');
} else if (UPDATE) {
  /* Shrink-only: an update may drop references, never add one. */
  const known = new Set((baseline.refs ?? []).map((entry) => `${entry.file}:${entry.line}:${entry.target}`));
  const next = unpinned.filter((entry) => known.has(`${entry.file}:${entry.line}:${entry.target}`));
  writeBaseline(next);
  console.log(`action pinning: baseline updated to ${next.length} (counts only ever shrink).`);
} else if (unpinned.length > (baseline.unpinned ?? 0)) {
  console.error(
    `action pinning check FAILED: ${unpinned.length} > baseline ${baseline.unpinned ?? 0} (+${unpinned.length - (baseline.unpinned ?? 0)}).`,
  );
  console.error('Pin every action to a commit SHA: node scripts/pin-actions.mjs');
  for (const entry of unpinned) console.error(`  ${entry.file}:${entry.line}  ${entry.target}`);
  process.exitCode = 1;
} else {
  console.log(`action pinning check passed (${total - unpinned.length}/${total} references pinned; baseline only shrinks).`);
}
