#!/usr/bin/env node
/*
 * scripts/check-external-hosts.mjs — keep the SPA off third-party hosts.
 *
 * Every byte the app needs at runtime is bundled: fonts (Inter / Plus Jakarta
 * Sans / Newsreader / Noto Sans SC), KaTeX, marked, DOMPurify, mermaid,
 * plotly, echarts, highlight.js and the connector brand marks all ship from
 * our own origin. That is what makes the app load at all on a network that
 * cannot reach the open internet — and it was undone twice by accident:
 *
 *   1. ui/linkFavicons.ts fell back to www.google.com/s2/favicons when a
 *      link's own /favicon.ico failed. That host is unreachable from mainland
 *      China, so the fallback hung until the browser's own timeout and kept
 *      the page's loading indicator spinning.
 *   2. index.html carried a dns-prefetch for www.geogebra.org that ran on
 *      every page load for a host almost no session ever uses.
 *
 * This guard makes both classes of mistake fail `npm run lint` instead of
 * shipping. It scans the SPA entry and all first-party source, strips
 * comments (a comment naming fonts.googleapis.com is prose, not a request),
 * and reports any absolute http(s) host that is not on the allowlist.
 *
 * Allowlist policy — a host belongs here only if it is either:
 *   - our own (topodrive.top and its subdomains), or
 *   - a provider base URL shown to the user as placeholder text, never
 *     fetched by the app (api.openai.com, api.minimax.io), or
 *   - the one deliberately remaining third-party host: GeoGebra's CDN, whose
 *     applet runtime is tens of megabytes and cannot be vendored. It is
 *     loaded lazily, only when a math_construction card mounts.
 *
 * The baseline lives at scripts/external-hosts.baseline.json and may only
 * shrink. Usage:  node scripts/check-external-hosts.mjs [--update]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = join(FRONTEND, 'scripts', 'external-hosts.baseline.json');
const UPDATE = process.argv.includes('--update');

/* Hosts that are allowed to appear as absolute URLs in first-party source. */
const ALLOWED_HOSTS = new Set([
  /* our own — marketing pages, privacy policy, native-app redirect targets */
  'topodrive.top',
  'www.topodrive.top',
  'app.topodrive.top',
  'api.topodrive.top',
  /* provider base URLs rendered as placeholder text in settings UI / i18n */
  'api.openai.com',
  'api.minimax.io',
  /* the one intentional third-party host — see the header comment */
  'www.geogebra.org',
  /* XML namespace identifiers inside inline <svg> strings. They are names,
   * not locations: a browser never issues a request for them. */
  'www.w3.org',
]);

const URL_RE = /https?:\/\/[a-zA-Z0-9._-]+/g;

/* Vendored third-party bundles are copies of upstream code: their URLs are
 * upstream's business, not ours, and they are never parsed for resource
 * loading beyond what the library itself decides. */
const SKIP_DIRS = new Set(['vendor-files', 'node_modules', 'dist', '.snapshot', 'wasm']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (SCAN_EXT.has(extname(entry))) out.push(abs);
  }
  return out;
}

const SCAN_EXT = new Set(['.js', '.mjs', '.ts', '.tsx', '.css', '.html']);

const SCAN_FILES = [
  join(FRONTEND, 'index.html'),
  ...walk(join(FRONTEND, 'src')),
];

/* Replace a matched comment with spaces, keeping every offset intact so the
 * reported line/column still points at the real code. */
function blank(match) {
  return match.replace(/[^\n]/g, ' ');
}

/* Strip comments without touching the `//` inside `https://`. Line comments
 * are only recognised outside a string literal and when not preceded by `:`. */
function stripComments(text, ext) {
  let out = text;
  if (ext === '.html') {
    out = out.replace(/<!--[\s\S]*?-->/g, blank);
  } else {
    out = out.replace(/\/\*[\s\S]*?\*\//g, blank);
  }
  if (ext === '.css' || ext === '.html') return out;

  const lines = out.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let quote = '';
    for (let k = 0; k < line.length - 1; k++) {
      const ch = line[k];
      if (quote) {
        if (ch === '\\') { k++; continue; }
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === '/' && line[k + 1] === '/' && line[k - 1] !== ':') {
        line = line.slice(0, k) + blank(line.slice(k));
        break;
      }
    }
    lines[i] = line;
  }
  return lines.join('\n');
}

function scan() {
  const hits = [];
  for (const abs of SCAN_FILES) {
    const rel = relative(FRONTEND, abs);
    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch (err) {
      hits.push({ file: rel, line: 0, host: `MISSING_FILE: ${err.message}` });
      continue;
    }
    const code = stripComments(text, extname(abs));
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const match of lines[i].matchAll(URL_RE)) {
        let host;
        try {
          host = new URL(match[0]).hostname;
        } catch {
          continue;
        }
        if (ALLOWED_HOSTS.has(host)) continue;
        hits.push({
          file: rel,
          line: i + 1,
          host,
          snippet: text.split('\n')[i].trim().slice(0, 140),
        });
      }
    }
  }
  return hits;
}

function keyOf(v) {
  return `${v.file}:${v.line}:${v.host}`;
}

function main() {
  const hits = scan();
  let baseline = null;
  if (existsSync(BASELINE)) {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  }
  const baseKeys = new Set((baseline?.violations || []).map(keyOf));

  if (!baseline) {
    writeFileSync(
      BASELINE,
      JSON.stringify(
        {
          generatedBy: 'check-external-hosts.mjs --update',
          violations: hits.map((v) => ({ file: v.file, line: v.line, host: v.host, snippet: v.snippet })),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`external-hosts: no baseline found — wrote ${hits.length} entr(ies) to scripts/external-hosts.baseline.json.`);
    for (const v of hits) console.log(`  ${keyOf(v)}  ${v.snippet}`);
    if (hits.length) {
      console.log('\nReview each entry: either it is not a runtime request (add the host to ALLOWED_HOSTS with a reason) or it is a real external dependency that must be vendored.');
    }
    return;
  }

  if (UPDATE) {
    /* ratchet: only ever remove entries, never add */
    const kept = [];
    const dropped = [];
    for (const v of hits) {
      if (baseKeys.has(keyOf(v))) kept.push(v);
      else dropped.push(`  dropped ${keyOf(v)} (no longer present)`);
    }
    writeFileSync(
      BASELINE,
      JSON.stringify(
        {
          generatedBy: 'check-external-hosts.mjs --update',
          violations: kept.map((v) => ({ file: v.file, line: v.line, host: v.host, snippet: v.snippet })),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`external-hosts: baseline updated to ${kept.length} entries (from ${baseKeys.size}).`);
    for (const d of dropped) console.log(d);
    return;
  }

  const newHits = hits.filter((v) => !baseKeys.has(keyOf(v)));
  if (newHits.length) {
    console.error(`external-hosts: ${newHits.length} non-allowlisted host(s) in the SPA (baseline has ${baseKeys.size}).`);
    for (const v of newHits) console.error(`  ${v.file}:${v.line}  ${v.host}\n      ${v.snippet}`);
    console.error('\nEvery runtime byte the app needs must come from our own origin — a third-party host is unreachable for users behind the GFW and shows up as a hung request.');
    console.error('Vendor the asset (see src/vendor-files/ and src/vendor/lazy.ts), or, if the URL is genuinely never fetched, add the host to ALLOWED_HOSTS in scripts/check-external-hosts.mjs with a reason.');
    process.exit(1);
  }
  console.log(`external-hosts: ok (${hits.length} baseline entr(ies), no new hosts; GeoGebra is the only third-party host left).`);
}

main();
