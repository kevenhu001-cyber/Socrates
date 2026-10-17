#!/usr/bin/env node
/*
 * scripts/check-doc-paths.mjs — entry docs must only point at paths that exist.
 *
 * The root README is the first thing a newcomer reads, and it is also the
 * document that rots fastest: it kept describing `mobile/` and its APK
 * workflows for four days after the tree was deleted (2026-10-12, commit
 * 06eb47a4), and still advertised a `sharp` dependency the server never had.
 * AGENTS.md was correct the whole time, which is exactly the failure mode —
 * two documents disagreeing and only one of them under review.
 *
 * This guard closes the mechanical half of that class: every relative
 * markdown/HTML link in the entry docs must resolve on disk. Prose can still
 * go stale (a sentence claiming a feature exists cannot be checked here), but
 * a link to a deleted directory fails `npm run lint`.
 *
 * Scope is deliberately the entry docs only. `docs/audits/**` are dated
 * snapshots and are expected to reference paths that no longer exist.
 *
 * Usage:  node scripts/check-doc-paths.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* Entry documents a reader is expected to trust as current. */
const DOCS = ['README.md', 'README.zh.md', 'AGENTS.md', 'CLAUDE.md'];

/* `[text](target)` and `![alt](target)`, with an optional title. */
const MARKDOWN_LINK = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
/* `<img src="…">` / `<a href="…">` in the README hero blocks. */
const HTML_LINK = /\b(?:src|href)="([^"]+)"/g;

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function isLocal(target) {
  if (!target || target.startsWith('#')) return false;
  if (EXTERNAL.test(target)) return false;
  /* Template placeholders and bare anchors are not paths. */
  return !target.includes('{') && !target.includes('$');
}

function collectLinks(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const links = [];
  let fenced = false;
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    /* Inline code is prose about syntax, not a link — `[link](url)` in the
     * rendering docs is the literal example, not a path. */
    const text = line.replace(/`[^`]*`/g, '');
    for (const re of [MARKDOWN_LINK, HTML_LINK]) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(text)) !== null) {
        const raw = match[1];
        if (!isLocal(raw)) continue;
        links.push({ target: raw.split('#')[0].split('?')[0], line: index + 1 });
      }
    }
  });
  return links;
}

const failures = [];
let checked = 0;

for (const doc of DOCS) {
  const absolute = join(ROOT, doc);
  if (!existsSync(absolute)) {
    failures.push({ doc, line: 0, target: doc, reason: 'entry document is missing' });
    continue;
  }
  for (const link of collectLinks(absolute)) {
    checked += 1;
    if (!link.target) continue;
    const resolved = resolve(dirname(absolute), link.target);
    if (existsSync(resolved)) continue;
    failures.push({
      doc,
      line: link.line,
      target: link.target,
      reason: resolved.startsWith(ROOT) ? 'target does not exist' : 'target escapes the repository',
    });
  }
}

if (failures.length) {
  console.error('doc path check FAILED:');
  for (const failure of failures) {
    console.error(`  ${failure.doc}:${failure.line}  ${failure.target} — ${failure.reason}`);
  }
  console.error('\nFix the link, or move the claim out of the entry docs.');
  process.exitCode = 1;
} else {
  console.log(`doc path check passed (${checked} relative links across ${DOCS.length} entry documents).`);
}
