#!/usr/bin/env node
/**
 * pin-actions — rewrite every `uses:` reference in .github/workflows to an
 * immutable commit SHA.
 *
 * WHY
 * ---
 * A tag (`actions/checkout@v4`) is a mutable pointer: whoever controls the
 * tag can repoint it at new code, and every workflow that references it
 * runs that new code with the repository's secrets and write token. Pinning
 * to a commit SHA removes that indirection; the human-readable version is
 * kept in a trailing comment so an upgrade is still reviewable.
 *
 * The companion guard is `scripts/check-action-pinning.mjs`, which runs
 * offline in CI and fails when a reference stops being a SHA.
 *
 * USAGE
 *   node scripts/pin-actions.mjs            # rewrite the workflows in place
 *   node scripts/pin-actions.mjs --check    # report unpinned refs, exit 1
 *   node scripts/pin-actions.mjs --dry-run  # print the rewrite, change nothing
 *
 * Network access is required for the rewrite (it resolves refs against
 * GitHub). `--check` is offline.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOW_DIR = '.github/workflows';
const SHA_RE = /^[0-9a-f]{40}$/;
/* `uses:` appears either as the first key of a list item (`- uses: …`) or as
 * a sibling key under a named step (`- name: …` / `  uses: …`). */
const USES_RE = /^(\s*(?:-\s*)?uses:\s*)([^\s#]+)(\s*)(#.*)?$/;

/** Every `owner/repo@ref` pair currently used by the workflows. */
export function collectActionRefs(workflowFiles) {
  const refs = [];
  for (const file of workflowFiles) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      const match = USES_RE.exec(line);
      if (!match) return;
      const target = match[2];
      if (target.startsWith('./') || target.startsWith('docker://')) return;
      const at = target.lastIndexOf('@');
      if (at <= 0) return;
      refs.push({
        file,
        index,
        target,
        repo: target.slice(0, at),
        ref: target.slice(at + 1),
        line,
      });
    });
  }
  return refs;
}

/**
 * Resolve a git ref to the commit SHA GitHub Actions would run.
 *
 * Annotated tags need the dereferenced `^{}` entry: GitHub checks out the
 * tag's target commit, not the tag object.
 */
export function resolveRef(repo, ref) {
  /* A `uses:` target may carry a sub-directory (`github/codeql-action/init`),
   * but the git repository is always the first two path segments. */
  const segments = repo.split('/');
  const gitRepo = segments.slice(0, 2).join('/');
  const url = `https://github.com/${gitRepo}.git`;
  const out = execFileSync(
    'git',
    ['ls-remote', '--tags', url, `refs/tags/${ref}`, `refs/tags/${ref}^{}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const entries = new Map();
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [sha, name] = trimmed.split(/\s+/);
    entries.set(name, sha);
  }
  if (entries.has(`refs/tags/${ref}^{}`)) return entries.get(`refs/tags/${ref}^{}`);
  if (entries.has(`refs/tags/${ref}`)) return entries.get(`refs/tags/${ref}`);
  return null;
}

function listWorkflows() {
  return readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => join(WORKFLOW_DIR, name))
    .sort();
}

function main() {
  const args = new Set(process.argv.slice(2));
  const checkOnly = args.has('--check');
  const dryRun = args.has('--dry-run');
  const files = listWorkflows();
  const refs = collectActionRefs(files);
  const unique = [...new Map(refs.map((r) => [`${r.repo}@${r.ref}`, r])).values()];

  if (checkOnly) {
    const unpinned = unique.filter((r) => !SHA_RE.test(r.ref));
    if (unpinned.length === 0) {
      console.log(`action pinning: ${unique.length} references, all pinned to a commit SHA`);
      return 0;
    }
    console.error('action pinning: unpinned references found');
    for (const r of unpinned) console.error(`  ${r.repo}@${r.ref}`);
    return 1;
  }

  const resolved = new Map();
  for (const r of unique) {
    if (SHA_RE.test(r.ref)) continue;
    const sha = resolveRef(r.repo, r.ref);
    if (!sha) {
      console.error(`  ! could not resolve ${r.repo}@${r.ref} — left untouched`);
      continue;
    }
    resolved.set(`${r.repo}@${r.ref}`, sha);
    console.log(`  ${r.repo}@${r.ref} -> ${sha}`);
  }

  if (dryRun) return 0;

  for (const file of files) {
    const original = readFileSync(file, 'utf8');
    const lines = original.split('\n');
    let changed = false;
    for (let i = 0; i < lines.length; i += 1) {
      const match = USES_RE.exec(lines[i]);
      if (!match) continue;
      const target = match[2];
      const at = target.lastIndexOf('@');
      if (at <= 0) continue;
      const repo = target.slice(0, at);
      const ref = target.slice(at + 1);
      const sha = resolved.get(`${repo}@${ref}`);
      if (!sha) continue;
      /* Keep the original version in a trailing comment so an upgrade is
       * still reviewable in a diff, and so a human can map the SHA back to
       * a release. */
      const indent = match[1];
      lines[i] = `${indent}${repo}@${sha} # ${ref}`;
      changed = true;
    }
    if (changed) {
      writeFileSync(file, lines.join('\n'));
      console.log(`updated ${file}`);
    }
  }
  return 0;
}

process.exit(main());
