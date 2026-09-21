// Dead-selector audit for frontend CSS — pass 2.
// For every .class / #id / [data-attr] token in selector position:
//   - "produced": appears in a class="..." / className= / classList.add /
//     data-attr="..." emit position in JS/TS/HTML
//   - "queried":  appears anywhere in source at all
// A selector whose token is never produced can never match → dead rule.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

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

// ── 1. collect selector tokens per file ─────────────────────────────
const tokens = new Map(); // token -> {kind, file}
for (const file of CSS_FILES) {
  let css;
  try { css = readFileSync(file, 'utf8'); } catch { continue; }
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  for (const chunk of css.split(/([{}])/)) {
    if (chunk === '{') depth++;
    else if (chunk === '}') depth--;
    else if (depth === 0) {
      for (const m of chunk.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g))
        if (!tokens.has(m[1])) tokens.set(m[1], { kind: 'class', file });
      for (const m of chunk.matchAll(/#([_a-zA-Z][_a-zA-Z0-9-]*)/g))
        if (!tokens.has(m[1])) tokens.set(m[1], { kind: 'id', file });
      for (const m of chunk.matchAll(/\[\s*(data-[_a-zA-Z0-9-]+)/g))
        if (!tokens.has(m[1])) tokens.set(m[1], { kind: 'attr', file });
    }
  }
}

// ── 2. scan sources ─────────────────────────────────────────────────
const SCAN_EXTS = new Set(['.js', '.ts', '.tsx', '.jsx', '.html', '.mjs']);
const fileList = [];
for (const dir of ['src', 'e2e', 'test']) { try { walk(dir, fileList); } catch {} }
try { fileList.push('index.html'); } catch {}
const docs = fileList.filter(f => SCAN_EXTS.has(extname(f))).map(f => readFileSync(f, 'utf8'));
const haystack = docs.join('\n');

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const camel = s => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
// Dynamic-construction detection: 'prefix-' + id or `prefix-${id}` in
// source means any class starting with that prefix may be produced.
const concatPrefixes = new Set();
// 'prefix-' + var  /  `prefix-${var}`  /  "...prefix-' + var (mid-string)
for (const m of haystack.matchAll(/([-_a-zA-Z0-9]+-)["'`]\s*\+|([-_a-zA-Z0-9]+-)\$\{/g)) {
  concatPrefixes.add(m[1] || m[2]);
}
function dynamicMatch(tok) {
  for (const p of concatPrefixes) if (p && tok.startsWith(p)) return p;
  return null;
}
const produced = [], queriedOnly = [], absent = [], dynamic = [];
for (const [tok, meta] of tokens) {
  let present;
  if (meta.kind === 'attr') {
    // [data-foo-bar] is emitted as data-foo-bar="..." OR dataset.fooBar
    const attrRx = new RegExp(`(?<![\\w-])${esc(tok)}(?![\\w-])`);
    const dsRx = new RegExp(`dataset\\.${esc(camel(tok.replace(/^data-/, '')))}\\b`);
    present = attrRx.test(haystack) || dsRx.test(haystack);
  } else {
    present = new RegExp(`(?<![\\w-])${esc(tok)}(?![\\w-])`).test(haystack);
  }
  if (!present) {
    const dyn = meta.kind === 'class' && dynamicMatch(tok);
    if (dyn) dynamic.push([tok, meta, dyn]); else absent.push([tok, meta]);
    continue;
  }
  // produced? look for emit patterns
  const emitRx = meta.kind === 'class'
    ? new RegExp(`(class=["'\`][^"'\`]*(?<![\\w-])${esc(tok)}(?![\\w-])|classList\\.(add|toggle|remove)\\(["'\`]${esc(tok)}|className\\s*[=+]?=[^;]*${esc(tok)})`)
    : meta.kind === 'id'
      ? new RegExp(`(id=["'\`]${esc(tok)}["'\`]|getElementById\\(["'\`]${esc(tok)}["'\`]|setAttribute\\(["'\`]id["'\`],\\s*["'\`]${esc(tok)}["'\`])`)
      : new RegExp(`${esc(tok)}\\s*=|dataset\\.${esc(tok.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase()))}|setAttribute\\(["'\`]${esc(tok)}`);
  (emitRx.test(haystack) ? produced : queriedOnly).push([tok, meta]);
}

console.log(`selector tokens: ${tokens.size}`);
console.log(`produced (alive): ${produced.length}`);
console.log(`queried-only (suspicious): ${queriedOnly.length}`);
console.log(`dynamic-prefix (produced via concat): ${dynamic.length}`);
console.log(`completely absent: ${absent.length}`);
console.log('\n── dynamic-prefix families ──');
for (const [t, m, p] of dynamic.slice(0, 60)) console.log(`  .${t}   ${m.file}  (prefix '${p}')`);
console.log('\n── absent (defined in CSS, zero references anywhere) ──');
for (const [t, m] of absent) console.log(`  ${m.kind === 'id' ? '#' : m.kind === 'attr' ? '[' : '.'}${t}   ${m.file}`);
console.log('\n── queried-only (referenced but never emitted — verify manually) ──');
for (const [t, m] of queriedOnly.slice(0, 150)) console.log(`  ${m.kind === 'id' ? '#' : m.kind === 'attr' ? '[' : '.'}${t}   ${m.file}`);
