// Prune dead rules from frontend CSS.
// A rule is dead iff EVERY selector in its selector list contains at
// least one token (class/id/data-attr) that is never produced in any
// source file. Mixed lists get the dead selectors pruned; the rule is
// kept if any selector survives.
// Dry-run by default; --write applies.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const WRITE = process.argv.includes('--write');
const CSS_FILES = ['src/styles.css', 'src/styles/chatgpt-ui.css', 'src/styles/chatgpt-v2.css',
  'src/styles/chat-surface.css', 'src/styles/lobe-overrides.css', 'src/styles/mobile-parity.css',
  'src/styles/ref-baseline.css', 'src/styles/themes.css', 'src/styles/tokens.css', 'src/styles/index.css'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

// ── token extraction (same as audit) ────────────────────────────────
const allTokens = new Map();
for (const file of CSS_FILES) {
  let css;
  try { css = readFileSync(file, 'utf8'); } catch { continue; }
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  for (const chunk of css.split(/([{}])/)) {
    if (chunk === '{') depth++;
    else if (chunk === '}') depth--;
    else if (depth === 0) {
      for (const m of chunk.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)) allTokens.set(m[1], 'class');
      for (const m of chunk.matchAll(/#([_a-zA-Z][_a-zA-Z0-9-]*)/g)) if (!allTokens.has(m[1])) allTokens.set(m[1], 'id');
      for (const m of chunk.matchAll(/\[\s*(data-[_a-zA-Z0-9-]+)/g)) if (!allTokens.has(m[1])) allTokens.set(m[1], 'attr');
    }
  }
}

const SCAN_EXTS = new Set(['.js', '.ts', '.tsx', '.jsx', '.html', '.mjs']);
const fileList = [];
for (const dir of ['src', 'e2e', 'test']) { try { walk(dir, fileList); } catch {} }
try { fileList.push('index.html'); } catch {}
const haystack = fileList.filter(f => SCAN_EXTS.has(extname(f))).map(f => readFileSync(f, 'utf8')).join('\n');

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const camel = s => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const concatPrefixes = new Set();
for (const m of haystack.matchAll(/([-_a-zA-Z0-9]+-)["'`]\s*\+|([-_a-zA-Z0-9]+-)\$\{/g)) concatPrefixes.add(m[1] || m[2]);

function isAlive(tok, kind) {
  if (kind === 'attr') {
    return new RegExp(`(?<![\\w-])${esc(tok)}(?![\\w-])`).test(haystack)
      || new RegExp(`dataset\\.${esc(camel(tok.replace(/^data-/, '')))}\\b`).test(haystack);
  }
  if (new RegExp(`(?<![\\w-])${esc(tok)}(?![\\w-])`).test(haystack)) return true;
  for (const p of concatPrefixes) if (p && tok.startsWith(p)) return true;
  return false;
}
const dead = new Set();
for (const [tok, kind] of allTokens) if (!isAlive(tok, kind)) dead.add(kind === 'attr' ? `[${tok}` : (kind === 'id' ? `#${tok}` : `.${tok}`));

// ── per-file prune ──────────────────────────────────────────────────
const tokRe = /\.-?[_a-zA-Z][_a-zA-Z0-9-]*|#[_a-zA-Z][_a-zA-Z0-9-]*|\[\s*data-[_a-zA-Z0-9-]+/g;
function selectorDead(sel) {
  let m; tokRe.lastIndex = 0;
  while ((m = tokRe.exec(sel))) {
    const t = m[0].startsWith('[') ? '[' + m[0].replace(/^\[\s*/, '') : m[0];
    if (dead.has(t)) return true;
  }
  return false;
}
function selectorHasToken(sel) { tokRe.lastIndex = 0; return tokRe.test(sel); }

// Minimal CSS block splitter honoring strings/comments.
function splitBlocks(css) {
  const blocks = []; // {pre, body} where pre = text before '{'
  let i = 0, start = 0, depth = 0;
  const n = css.length;
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") { i++; while (i < n && css[i] !== c) { if (css[i] === '\\') i++; i++; } i++; continue; }
    if (c === '{') {
      if (depth === 0) {
        // find matching close of this block (strings/comments aware)
        const bodyStart = i + 1;
        let j = i + 1, d = 1;
        while (j < n && d > 0) {
          const cc = css[j];
          if (cc === '/' && css[j + 1] === '*') { const e = css.indexOf('*/', j + 2); j = e < 0 ? n : e + 2; continue; }
          if (cc === '"' || cc === "'") { j++; while (j < n && css[j] !== cc) { if (css[j] === '\\') j++; j++; } j++; continue; }
          if (cc === '{') d++;
          else if (cc === '}') d--;
          j++;
        }
        blocks.push({ pre: css.slice(start, i), body: css.slice(bodyStart, j - 1), end: j });
        start = j;
        i = j;
        continue;
      }
    }
    i++;
  }
  blocks.push({ pre: css.slice(start), body: null, end: n });
  return blocks;
}

let totalDropped = 0, totalPruned = 0;
for (const file of CSS_FILES) {
  let css;
  try { css = readFileSync(file, 'utf8'); } catch { continue; }
  const blocks = splitBlocks(css);
  let out = '';
  for (const b of blocks) {
    if (b.body === null) { out += b.pre; continue; }
    const selText = b.pre;
    const atMatch = selText.match(/@(media|supports|keyframes|font-face|page|charset|import|layer|container|property|scope)[^\{]*$/i);
    if (atMatch) {
      // recurse into at-rule bodies that contain rules (media/supports/layer)
      if (/^@(media|supports|layer|container|scope)\b/i.test(atMatch[0].trim() ? atMatch[0] : '')) {
        const inner = splitBlocks(b.body);
        let innerOut = '';
        for (const ib of inner) innerOut += ib.body === null ? ib.pre : pruneRule(ib.pre, ib.body);
        out += selText + '{' + innerOut + '}';
      } else {
        out += selText + '{' + b.body + '}';
      }
      continue;
    }
    out += pruneRule(selText, b.body);
  }
  function splitSelectorList(pre) {
    /* Split leading trivia (comments + whitespace) off the selector
       list so commas inside a comment can't split a "selector" mid-
       token — that was the bug that glued `/* ...Scheduled` onto a
       rule body and comment-ate the following ~8 KB of live CSS.
       Selector commas are split only at paren depth 0 so functional
       pseudo lists like :is(.a,.b) stay intact. */
    var i = 0, n = pre.length;
    while (i < n) {
      var c = pre[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f') { i++; continue; }
      if (c === '/' && pre[i + 1] === '*') { var e = pre.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      break;
    }
    var leading = pre.slice(0, i), selText = pre.slice(i);
    var parts = [], cur = '', depth = 0, j = 0, sn = selText.length;
    while (j < sn) {
      var ch = selText[j];
      if (ch === '/' && selText[j + 1] === '*') { var e2 = selText.indexOf('*/', j + 2); cur += selText.slice(j, e2 < 0 ? sn : e2 + 2); j = e2 < 0 ? sn : e2 + 2; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; j++; continue; }
      cur += ch; j++;
    }
    parts.push(cur);
    return { leading: leading, parts: parts };
  }

  function pruneRule(pre, body) {
    var sl = splitSelectorList(pre);
    var kept = [], droppedSels = [];
    for (var si = 0; si < sl.parts.length; si++) {
      var s = sl.parts[si];
      if (!selectorHasToken(s)) { kept.push(s); continue; } // element/pseudo-only selector: can't prove dead
      if (selectorDead(s)) droppedSels.push(s); else kept.push(s);
    }
    if (!kept.length) { totalDropped++; return sl.leading; } // keep comments/banners, drop only the rule
    if (droppedSels.length) totalPruned++;
    return sl.leading + kept.join(',') + '{' + body + '}';
  }
  if (WRITE && out !== css) writeFileSync(file, out);
  const before = css.length, after = out.length;
  console.log(`${file}: ${before} -> ${after} bytes (${((1 - after / before) * 100).toFixed(1)}% smaller)`);
}
console.log(`rules dropped: ${totalDropped}, selector lists pruned: ${totalPruned}`);
console.log(WRITE ? 'WROTE FILES' : 'dry run — pass --write to apply');
