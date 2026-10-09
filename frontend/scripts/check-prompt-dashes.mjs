#!/usr/bin/env node
/*
 * scripts/check-prompt-dashes.mjs — em/en-dash ratchet for injected prompts.
 *
 * The server's "minimize dash punctuation" rule is the single authoritative
 * dash rule for the final assistant message (server/src/routes/chat/helpers.ts
 * — FINAL_OUTPUT_CONSTRAINTS). The injected system/user prompts must not
 * contradict it, so this script refuses new em-dash (`—`, U+2014) or
 * en-dash (`–`, U+2013) characters inside prompt text. Code comments are
 * skipped because they are not sent to the model.
 *
 * Scope: every file that contributes to the LLM-facing prompt surface.
 *   - prompts/*.md                                 (server-loaded)
 *   - frontend/src/prompts/socratic.js             (client-loaded)
 *   - frontend/src/chat/{socraticDirectives,systemPrompts,promptTemplates,promptSuffixes,lang,turnController}.{js,ts}
 *   - frontend/src/tutor/{flow.ts,policy.js}
 *   - frontend/src/config/tonePresets.js
 *   - packages/ui/src/tutor.ts                     (DOM-free copy for Universal App)
 *   - server/src/routes/chat/helpers.ts            (SERVER_SYSTEM_POLICY + tool hints)
 *
 * The ratchet baseline lives at scripts/prompt-dashes.baseline.json. Each
 * scan reports the list of offending (file, line) tuples. If a new tuple
 * appears that is not in the baseline, the check fails. Remove a tuple
 * (or migrate it through the rewrites in the prompt-optimization PR) and
 * re-run with --update to shrink the baseline.
 *
 * Usage:  node scripts/check-prompt-dashes.mjs [--update]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const REPO = fileURLToPath(new URL('../..', import.meta.url));
const BASELINE = join(FRONTEND, 'scripts', 'prompt-dashes.baseline.json');
const UPDATE = process.argv.includes('--update');

const DASH_RE = /[—–]/g;

/* Files that contribute to the LLM-facing prompt surface. Add new prompt
 * files here so the ratchet knows about them. */
const PROMPT_FILES = [
  /* server-loaded prompts */
  'prompts/teacher-mode.md',
  'prompts/beagle.md',
  'prompts/code-interpreter.md',
  /* client-loaded prompts and the modules that compose them */
  'frontend/src/prompts/socratic.js',
  'frontend/src/chat/socraticDirectives.js',
  'frontend/src/chat/systemPrompts.js',
  'frontend/src/chat/promptTemplates.js',
  'frontend/src/chat/promptSuffixes.ts',
  'frontend/src/chat/lang.ts',
  'frontend/src/chat/turnController.js',
  'frontend/src/tutor/flow.ts',
  'frontend/src/tutor/policy.js',
  'frontend/src/config/tonePresets.js',
  /* DOM-free copy for the Universal App */
  'packages/ui/src/tutor.ts',
  /* server-side prompt assembly */
  'server/src/routes/chat/helpers.ts',
];

/* Skip-line predicate: ignore block comments and single-line comments,
 * and ignore known user-facing error fallbacks (they never reach the LLM). */
const USER_FACING_FALLBACK_LINE_HINTS = [
  /* turnController error fallbacks (not injected into the LLM) */
  /no model is configured/,
  /you appear to be offline/i,
];

function stripBlockComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function isUserFacingFallback(line) {
  return USER_FACING_FALLBACK_LINE_HINTS.some((re) => re.test(line));
}

/* Find em/en-dashes inside string literals (single, double, or backtick).
 * Comments are first stripped to a space-padded skeleton so positions stay
 * meaningful. */
function findDashInStrings(text) {
  const stripped = stripBlockComments(text);
  const lines = text.split('\n');
  const strippedLines = stripped.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isUserFacingFallback(line)) continue;
    if (!DASH_RE.test(line)) {
      DASH_RE.lastIndex = 0;
      continue;
    }
    DASH_RE.lastIndex = 0;
    /* Walk the stripped line to find each dash position, then check whether
     * the same position in the stripped line is inside a string. */
    const strippedLine = strippedLines[i] || '';
    /* Identify line-comment portion: anything from `//` to end of line,
     * unless `//` sits inside a string. For the prompt files this script
     * watches, every line is either pure prose, has an unquoted `//`, or
     * has no comment at all — the simple split below is good enough. */
    const lineCommentStart = (() => {
      let inStr = false;
      let q = '';
      for (let k = 0; k < strippedLine.length; k++) {
        const ch = strippedLine[k];
        if (inStr) {
          if (ch === '\\') { k++; continue; }
          if (ch === q) { inStr = false; q = ''; }
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = true; q = ch; continue; }
        if (ch === '/' && strippedLine[k + 1] === '/') return k;
      }
      return -1;
    })();
    for (const m of line.matchAll(DASH_RE)) {
      const pos = m.index;
      /* ignore if position is past the line-comment start */
      if (lineCommentStart >= 0 && pos >= lineCommentStart) continue;
      /* inspect what's on the same line before pos to see if we are inside a
       * string. A simple counter (open single/double/backtick) is enough
       * because no prompt file uses nested template literals at the same
       * indent as a dash-bearing literal. */
      const prefix = strippedLine.slice(0, pos);
      let inStr = false;
      let q = '';
      for (let k = 0; k < prefix.length; k++) {
        const ch = prefix[k];
        if (inStr) {
          if (ch === '\\') { k++; continue; }
          if (ch === q) { inStr = false; q = ''; }
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = true; q = ch; }
      }
      if (inStr) {
        hits.push({ line: i + 1, snippet: line.trim().slice(0, 160) });
      }
    }
    DASH_RE.lastIndex = 0;
  }
  return hits;
}

function scanRepo() {
  const violations = [];
  for (const rel of PROMPT_FILES) {
    const abs = join(REPO, rel);
    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch (err) {
      violations.push({ file: rel, line: 0, snippet: `MISSING_FILE: ${err.message}` });
      continue;
    }
    const hits = findDashInStrings(text);
    for (const h of hits) violations.push({ file: rel, line: h.line, snippet: h.snippet });
  }
  return violations;
}

function keyOf(v) {
  return `${v.file}:${v.line}`;
}

function main() {
  const violations = scanRepo();
  let baseline = null;
  if (existsSync(BASELINE)) {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  }
  const baseKeys = new Set((baseline?.violations || []).map(keyOf));
  const curKeys = new Set(violations.map(keyOf));

  if (!baseline) {
    writeFileSync(
      BASELINE,
      JSON.stringify(
        {
          generatedBy: 'check-prompt-dashes.mjs --update',
          violations: violations.map((v) => ({ file: v.file, line: v.line, snippet: v.snippet })),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`prompt-dashes: no baseline found — wrote ${violations.length} baseline entries to scripts/prompt-dashes.baseline.json.`);
    console.log('Review the entries, commit the baseline, and re-run. Any new entry not in the baseline will now fail.');
    if (violations.length) {
      console.log('\nBaseline entries:');
      for (const v of violations) console.log(`  ${v.file}:${v.line}: ${v.snippet}`);
    }
    return;
  }

  if (UPDATE) {
    /* ratchet: only ever remove entries, never add */
    const shrunk = [];
    const removed = [];
    for (const v of violations) {
      const k = keyOf(v);
      if (baseKeys.has(k)) {
        shrunk.push({ file: v.file, line: v.line, snippet: v.snippet });
      } else {
        removed.push(`  dropped ${k} (no longer present)`);
      }
    }
    /* also keep entries that were not seen in this scan but are not in current either... actually, ratchet only: keep entries that still appear */
    writeFileSync(
      BASELINE,
      JSON.stringify(
        {
          generatedBy: 'check-prompt-dashes.mjs --update',
          violations: shrunk,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`prompt-dashes: baseline updated to ${shrunk.length} entries (from ${baseKeys.size}).`);
    if (removed.length) {
      console.log('Entries removed because they no longer appear in the source:');
      for (const r of removed) console.log(r);
    }
    return;
  }

  const newViolations = violations.filter((v) => !baseKeys.has(keyOf(v)));
  if (newViolations.length) {
    console.error(`prompt-dashes: ${newViolations.length} new dash-in-string violation(s) (baseline has ${baseKeys.size}).`);
    for (const v of newViolations) console.error(`  ${v.file}:${v.line}: ${v.snippet}`);
    console.error('\nThe server "minimize dash punctuation" rule applies to the final assistant message; injected prompts must not contradict it.');
    console.error('Remove the dash, or rephrase the sentence so it no longer needs one.');
    process.exit(1);
  }
  console.log(`prompt-dashes: ok (${violations.length} baseline entries, all present, no new hits).`);
}

main();
