#!/usr/bin/env node
/*
 * scripts/check-css-debt.mjs — CSS design-debt ratchet + cascade guard.
 *
 * Three machine-checked rules keep the canonical CSS contract stable:
 *
 * 1. Cascade order: styles/index.css must import structural tokens first,
 *    compatibility layers before canonical components, and themes.css exactly
 *    once at the end. Order-sensitive nested manifests are locked too, because
 *    reordering their slices silently flips ownership or visual winners.
 *
 * 2. Theme ownership: live component styles cannot declare palette families;
 *    themes.css is the sole owner and is always the final import.
 *
 * 3. Debt ratchet: for every stylesheet under src/styles we count
 *    `!important`, literal hex colors, literal px border-radius values, and
 *    selectors that repeat one id three or more times (`#appShell#appShell…`).
 *    legacy/ and restore/ are frozen historical zones; every other directory
 *    is "live". Counts may only go DOWN — if a metric grows past its baseline
 *    the check fails. Shrink the baseline with --update after an intentional
 *    reduction.
 *
 * Usage:  node scripts/check-css-debt.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const STYLES = join(FRONTEND, 'src', 'styles');
const BASELINE = join(FRONTEND, 'scripts', 'css-debt.baseline.json');
const UPDATE = process.argv.includes('--update');

const FROZEN_DIRS = new Set(['legacy', 'restore']);

/* These aggregate files document their ordering contract inline. Keep the
 * machine check in sync with that contract so a routine import shuffle cannot
 * change the cascade unnoticed. Adding or intentionally moving a slice should
 * update both the owning manifest and this reviewed list. */
const ORDERED_MANIFESTS = {
  'legacy/index.css': [
    './00-foundations.css',
    './01-sidebar.css',
    './02-modals-library.css',
    './03-workspace-panels.css',
    './04-topbar-menus.css',
    './05-chat-landing.css',
    './06-chat-transcript.css',
    './07-composer-settings.css',
    './08-exam.css',
    './09-viz-markdown.css',
    './10-tutor-scaffolds.css',
    './11-agent-tools.css',
    './12-tutor-inline-tools.css',
    './13-composer-rich.css',
    './14-tool-surfaces.css',
    './15-thinking-activity.css',
    './16-final-contract.css',
  ],
  'restore/index.css': [
    './chatgpt-ui.css',
    './chatgpt-v2.css',
    './ref-baseline.css',
    './mobile-parity.css',
    './chat-surface.css',
    './chatgpt-parity.css',
    './fixes.css',
    './creation-surfaces.css',
  ],
  'parity/index.css': [
    './sidebar.css',
    './topbar.css',
    './composer-unified.css',
    './transcript.css',
  ],
  'polish/index.css': [
    './sidebar.css',
    './topbar.css',
    './composer.css',
    './transcript.css',
    './overlays.css',
    './workspace.css',
    './auth.css',
    './home.css',
    './mobile.css',
    './press.css',
    './buttons.css',
    './mobile-controls.css',
    './mobile-shell.css',
    './mobile-sidebar.css',
    './mobile-directories.css',
  ],
};

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

function walkCss(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkCss(p));
    else if (entry.name.endsWith('.css')) out.push(p);
  }
  return out;
}

function themeOwnershipProblems() {
  const paletteDeclaration = /--(?:ui-(?:bg|text|border|shadow|composer|sidebar|accent|danger|success|link|backdrop|on-accent)|cg-|cgv-|chatgpt-|conversation-|bg-|text-|border-)[\w-]*\s*:/g;
  const problems = [];
  for (const file of walkCss(STYLES)) {
    const rel = relative(STYLES, file).split(sep).join('/');
    const top = rel.split('/')[0];
    if (rel === 'themes.css' || rel === 'tokens.css' || FROZEN_DIRS.has(top)) continue;
    const text = stripComments(readFileSync(file, 'utf8'));
    for (const match of text.matchAll(paletteDeclaration)) {
      const line = text.slice(0, match.index).split('\n').length;
      problems.push(`${rel}:${line} palette declaration outside themes.css: ${match[0].slice(0, -1)}`);
    }
  }
  return problems;
}

function countMetric(re, text) {
  let n = 0;
  while (re.exec(text) !== null) n += 1;
  return n;
}

/* ---------- 3. stacked-id specificity ---------- */
/* A selector that repeats the same id (`#appShell#appShell#appShell …`) is
 * not styling, it is winning a cascade fight by brute force. Each new one
 * makes the next legitimate rule harder to place, which is how
 * restore/fixes.css accumulated 21 of them. The count is ratcheted exactly
 * like the other metrics so it can only shrink. */
function countStackedIdSelectors(text) {
  let n = 0;
  for (const m of text.matchAll(/([^{}]*)\{/g)) {
    const ids = m[1].match(/#[A-Za-z][A-Za-z0-9_-]*/g);
    if (!ids) continue;
    const counts = new Map();
    for (const raw of ids) {
      const id = raw.slice(1);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    for (const c of counts.values()) {
      if (c >= 3) { n += 1; break; }
    }
  }
  return n;
}

function importsIn(file) {
  const text = stripComments(readFileSync(file, 'utf8'));
  return [...text.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

const METRICS = {
  important: /!important/g,
  hexColor: /#[0-9a-fA-F]{3,8}\b/g,
  literalRadius: /border-radius:\s*(?:[0-9.]+px|var\([^)]*\)\s+[0-9.]+px)/g,
  stackedId: countStackedIdSelectors,
  /*
   * Literal px font-size.
   *
   * This was the largest unguarded surface: ~190 live declarations spread over
   * 19 distinct sizes, including 11.5/12.5/13.5/14.5px half-steps that no
   * scale explains. tokens.css publishes a type scale (xxs→xxl, plus the
   * parity steps --ui-text-ui/body/hero), so a literal means that surface is
   * not on the scale and will not track the user's font-size preference.
   *
   * Counting is per-declaration, so `font-size: 12px` and `font-size:
   * calc(11px * var(--app-font-scale))` are both hits — the calc form is
   * still a literal step, just one that scales. Deliberate, documented
   * exceptions (a hero, a one-off) should be deleted rather than baselined.
   */
  literalFontSize: /font-size:\s*(?:\d+(?:\.\d+)?px|calc\(\s*\d+(?:\.\d+)?px)/g,
};

/* ---------- 1. cascade order ---------- */
function checkCascadeOrder() {
  const imports = importsIn(join(STYLES, 'index.css'));
  const tierOf = (spec) => {
    if (spec === './tokens.css') return 1;
    if (spec.startsWith('./legacy/')) return 2;
    if (spec.startsWith('./foundations/') || spec.startsWith('./layout/')
      || spec.startsWith('./components/') || spec.startsWith('./features/')) return 3;
    if (spec.startsWith('./restore/')) return 3.5;
    if (spec.startsWith('./parity/')) return 4;
    if (spec.startsWith('./polish/')) return 5;
    if (spec === './themes.css') return 6;
    return 3;
  };
  const problems = [];
  const tiers = imports.map(tierOf);
  for (let i = 1; i < tiers.length; i += 1) {
    // Tiers must be non-decreasing EXCEPT that index.css imports one file
    // per tier (legacy/index.css etc.), which is already handled because the
    // nested order lives inside those index files. Here we only check the
    // top-level manifest.
    if (tiers[i] < tiers[i - 1]) {
      problems.push(`tier regression: '${imports[i]}' (tier ${tiers[i]}) imported after '${imports[i - 1]}' (tier ${tiers[i - 1]})`);
    }
  }
  const themeImports = imports.filter((spec) => spec === './themes.css');
  if (themeImports.length !== 1) problems.push(`themes.css must be imported exactly once (found ${themeImports.length})`);
  if (imports[imports.length - 1] !== './themes.css') problems.push('themes.css must be the final import');
  if (!imports.includes('./polish/index.css')) problems.push('polish/index.css missing from styles/index.css');

  for (const [manifest, expected] of Object.entries(ORDERED_MANIFESTS)) {
    const actual = importsIn(join(STYLES, manifest));
    if (actual.length !== expected.length) {
      problems.push(`${manifest} import count changed (expected ${expected.length}, found ${actual.length})`);
    }
    const length = Math.max(actual.length, expected.length);
    for (let i = 0; i < length; i += 1) {
      if (actual[i] !== expected[i]) {
        problems.push(`${manifest} import #${i + 1} must be '${expected[i] ?? '(none)'}' (found '${actual[i] ?? '(none)'}')`);
      }
    }
  }
  return problems;
}

/* ---------- 1b. split-load order ---------- */
/* P_perf-css-split — the single render-blocking stylesheet is delivered as
 * ordered slices (critical-* blocking, deferred-* via media=print swap).
 * The <link> order in frontend/index.html must reproduce the flattened
 * styles/index.css file-for-file: any shuffle silently flips cascade
 * winners. styles/index.css stays the canonical manifest (still checked
 * above); this check pins the HTML to it. */
function checkHtmlLoadOrder() {
  const problems = [];
  const flatExpected = [];
  for (const spec of importsIn(join(STYLES, 'index.css'))) {
    const key = spec.replace(/^\.\//, '');
    const nested = ORDERED_MANIFESTS[key];
    if (nested) {
      const dir = key.slice(0, key.lastIndexOf('/') + 1);
      for (const sub of nested) flatExpected.push(dir + sub.replace(/^\.\//, ''));
    } else {
      flatExpected.push(key);
    }
  }
  const html = readFileSync(join(FRONTEND, 'index.html'), 'utf8');
  const linkRe = /<link\s+rel="stylesheet"\s+href="\/src\/styles\/([^"]+)"([^>]*)>/g;
  const flatActual = [];
  let m;
  let linkIndex = 0;
  let deferredCount = 0;
  while ((m = linkRe.exec(html)) !== null) {
    linkIndex += 1;
    const manifest = m[1];
    const attrs = m[2] || '';
    /* A link is either a slice manifest (critical-*.css, expanded below)
     * or a self-contained leaf (no @import — the below-fold files). Both
     * contribute their files in document order. */
    const isManifest = manifest !== 'themes.css' && importsIn(join(STYLES, manifest)).length > 0;
    const isDeferred = !isManifest && manifest !== 'themes.css' || /^deferred-/.test(manifest);
    if (isDeferred) {
      deferredCount += 1;
      if (!/media="print"/.test(attrs) || !/onload="this\.media='all'"/.test(attrs)) {
        problems.push(`<link> #${linkIndex} (${manifest}) must load non-blocking via media="print" onload="this.media='all'"`);
      }
    } else if (/media=/.test(attrs)) {
      problems.push(`<link> #${linkIndex} (${manifest}) is a critical slice and must stay render-blocking (no media=)`);
    }
    if (manifest === 'themes.css') {
      flatActual.push('themes.css');
      continue;
    }
    const nested = importsIn(join(STYLES, manifest));
    if (nested.length === 0) {
      /* Self-contained leaf linked directly. A leaf must stay @import-free:
       * Vite asset-handles non-entry stylesheet links instead of resolving
       * their imports, which would ship raw @import text to the browser. */
      const leafText = stripComments(readFileSync(join(STYLES, manifest), 'utf8'));
      if (/@import\s+['"]/.test(leafText)) {
        problems.push(`${manifest} is linked directly but contains @import — only slice manifests may carry imports`);
      } else {
        flatActual.push(manifest);
      }
    } else {
      for (const spec of nested) {
        flatActual.push(spec.replace(/^\.\//, ''));
      }
    }
  }
  if (deferredCount === 0) problems.push('no below-fold stylesheet links found in index.html — the css split regressed to a single blocking bundle');
  if (flatActual.filter((f) => f === 'themes.css').length !== 1) {
    problems.push('themes.css must close the cascade exactly once as the final <link>');
  } else if (flatActual[flatActual.length - 1] !== 'themes.css') {
    problems.push('themes.css must be the final stylesheet <link>');
  }
  if (flatActual.length !== flatExpected.length) {
    problems.push(`split-bundle file count changed (expected ${flatExpected.length}, found ${flatActual.length}) — styles/index.css and the index.html slices drifted`);
  }
  const length = Math.max(flatActual.length, flatExpected.length);
  for (let i = 0; i < length; i += 1) {
    if (flatActual[i] !== flatExpected[i]) {
      problems.push(`cascade position #${i + 1} must be '${flatExpected[i] ?? '(none)'}' (found '${flatActual[i] ?? '(none)'}')`);
    }
  }
  return problems;
}

/* ---------- 2. debt ratchet ---------- */
function collectCounts() {
  const totals = { live: {}, frozen: {} };
  for (const dir of ['live', 'frozen']) totals[dir] = Object.fromEntries(Object.keys(METRICS).map((k) => [k, 0]));
  const perFile = {};
  for (const file of walkCss(STYLES)) {
    const rel = relative(STYLES, file).split(sep).join('/');
    const top = rel.split('/')[0];
    const zone = FROZEN_DIRS.has(top) ? 'frozen' : 'live';
    const text = stripComments(readFileSync(file, 'utf8'));
    perFile[rel] = { zone };
    for (const [name, matcher] of Object.entries(METRICS)) {
      const n = typeof matcher === 'function' ? matcher(text) : countMetric(matcher, text);
      totals[zone][name] += n;
      perFile[rel][name] = n;
    }
  }
  return { totals, perFile };
}

function main() {
  const orderProblems = checkCascadeOrder();
  const { totals } = collectCounts();

  let baseline = null;
  if (existsSync(BASELINE)) {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  }

  const failures = [
    ...orderProblems.map((p) => `cascade: ${p}`),
    ...checkHtmlLoadOrder().map((p) => `load order: ${p}`),
    ...themeOwnershipProblems().map((p) => `theme ownership: ${p}`),
  ];

  if (!baseline) {
    writeFileSync(BASELINE, JSON.stringify({ totals, generatedBy: 'check-css-debt.mjs --update' }, null, 2) + '\n');
    console.log('css-debt: no baseline found — wrote scripts/css-debt.baseline.json from current counts.');
    console.log('Review the numbers, commit the baseline, and re-run. Growth beyond it will now fail.');
  } else if (UPDATE) {
    const shrunk = {};
    for (const zone of Object.keys(totals)) {
      shrunk[zone] = {};
      for (const metric of Object.keys(totals[zone])) {
        const cur = totals[zone][metric];
        const base = baseline?.totals?.[zone]?.[metric] ?? cur;
        // ratchet: only ever record the smaller number, never grow the budget
        shrunk[zone][metric] = Math.min(cur, base);
      }
    }
    writeFileSync(BASELINE, JSON.stringify({ totals: shrunk, generatedBy: 'check-css-debt.mjs --update' }, null, 2) + '\n');
    console.log('css-debt: baseline updated (counts only ever shrink).');
  } else {
    for (const zone of ['live', 'frozen']) {
      for (const metric of Object.keys(METRICS)) {
        const cur = totals[zone][metric];
        const base = baseline?.totals?.[zone]?.[metric];
        if (base == null) { failures.push(`baseline missing ${zone}.${metric}`); continue; }
        if (cur > base) {
          failures.push(`${zone}.${metric}: ${cur} > baseline ${base} (+${cur - base}). Design debt may only shrink — revert the additions or, if intentional, migrate the rule into an existing token/layer.`);
        }
      }
    }
  }

  if (failures.length) {
    console.error('css-debt check FAILED:');
    for (const f of failures) console.error('  - ' + f);
    process.exitCode = 1;
  } else if (!baseline || UPDATE) {
    // informational paths above already printed; exit 0
  } else {
    console.log('css-debt check passed (live:', JSON.stringify(totals.live), '| frozen:', JSON.stringify(totals.frozen), ')');
  }
}

main();
