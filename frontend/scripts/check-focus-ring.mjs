#!/usr/bin/env node
/*
 * scripts/check-focus-ring.mjs — focus-indicator ratchet.
 *
 * The product contract for keyboard focus is one double ring, painted as a
 * two-layer box-shadow:
 *
 *   layer 1  a 2px gap in the page colour
 *   layer 2  a 2px ring in --ui-focus-ring
 *
 * Four properties make it a contract rather than a convention:
 *
 *   1. the shape lives in one token, so there is exactly one ring to reason
 *      about and every focusable surface shows the same detail;
 *   2. the indicator is a box-shadow, so the gap can carry the page colour
 *      underneath the ring — a single outline cannot express two layers;
 *   3. the ring clears 3:1 against every rung of the background ladder in
 *      both modes, so it is an indicator and not decoration;
 *   4. nothing else paints a focus ring. A stray outline or a focus-time
 *      box-shadow turns the double ring into a lopsided third one.
 *
 * The check resolves the palette, composites the ring the way the browser
 * does, and fails when the contract is broken or when a surface starts
 * painting a ring of its own.
 *
 * Usage:  node scripts/check-focus-ring.mjs
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const STYLES = join(FRONTEND, 'src', 'styles');
const THEMES_CSS = join(STYLES, 'themes.css');
const BASE_CSS = join(STYLES, 'foundations', 'base.css');
const BASELINE = join(FRONTEND, 'scripts', 'focus-ring.baseline.json');
const UPDATE = process.argv.includes('--update');

/* The minimum WCAG contrast between the ring and the surface it lands on.
 * 3:1 is the non-text-contrast requirement; the ring is an indicator, not
 * decoration, so it has to clear it on every rung of the ladder. */
const DEFAULT_MIN_CONTRAST = 3.0;

/* Rungs of the background ladder the ring has to clear. */
const RUNGS = ['page', 'rail', 'panel', 'elevated'];

/*
 * Surfaces that are allowed to own their focus indicator, because they
 * cannot use the shared ring:
 *
 *   - a range thumb draws its ring on the thumb, not on the input;
 *   - a container that reacts to :focus-within paints the whole well;
 *   - the main content region is a scroll surface, not a control;
 *   - the 10px sidebar resize handle is too narrow for a 4px outward ring,
 *     so it draws the same gap+ring structure inward at 1px.
 */
const SHADOW_EXEMPTIONS = [
  { match: /::(-webkit|-moz)-.*slider-thumb/, why: 'range thumb paints its own ring' },
  { match: /slider-thumb/, why: 'range thumb paints its own ring' },
  { match: /:focus-within/, why: 'container reacts to focus-within' },
  { match: /#mainContent/, why: 'scroll surface, not a control' },
  { match: /\.sidebar-resize-handle/, why: '10px handle draws the ring inward at 1px' },
  {
    match: /workspace-search-field input|plugin-directory-search input|sidebar-search input/,
    why: 'the container carries the focus treatment',
  },
  { match: /intui-slider input/, why: 'the range thumb carries the focus ring' },
];

function stripComments(text) {
  /* Comments are blanked rather than removed, so the line numbers the
   * violations report stay the line numbers in the file. */
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ''));
}

/* Extract the body of a top-level rule whose selector matches. */
function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp('(^|[}\\n])\\s*' + escaped + '\\s*\\{', 'm');
  const match = pattern.exec(css);
  if (!match) return null;
  const start = css.indexOf('{', match.index);
  let depth = 0;
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(start + 1, i);
    }
  }
  return null;
}

/* Collect `--name: value;` declarations from a rule body. */
function declarations(body) {
  const out = new Map();
  if (!body) return out;
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!out.has(match[1])) out.set(match[1], match[2].trim());
  }
  return out;
}

/* Resolve `var(--x)` chains inside one declaration map. */
function resolveValue(value, vars, seen = new Set()) {
  if (!value.includes('var(')) return value;
  const match = /var\(\s*(--[\w-]+)/.exec(value);
  if (!match || seen.has(match[1])) return value;
  seen.add(match[1]);
  const next = vars.get(match[1]);
  if (!next) return value;
  return resolveValue(value.replace(match[0], next), vars, seen);
}

function hexToRgb(hex) {
  const clean = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
}

/* Composite a translucent foreground over an opaque background. */
function composite(fg, alpha, bg) {
  return fg.map((channel, i) => Math.round(channel * alpha + bg[i] * (1 - alpha)));
}

function relativeLuminance(rgb) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/*
 * Parse a stylesheet into flat rules. Nested at-rules (@media) are walked
 * into, because a focus rule inside a media query is still a focus rule.
 * The forced-colours context is carried along, because inside it the
 * indicator is painted with the system colour instead of the ring token.
 */
function parseRules(css, baseOffset = 0, inForcedColors = false) {
  const out = [];
  let buffer = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '{') {
      let depth = 1;
      let j = i + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth += 1;
        else if (css[j] === '}') depth -= 1;
        j += 1;
      }
      const body = css.slice(i + 1, j - 1);
      const selector = buffer.trim();
      buffer = '';
      if (selector.startsWith('@')) {
        const forced = inForcedColors || /forced-colors\s*:\s*active/.test(selector);
        out.push(...parseRules(body, baseOffset + i, forced));
      } else if (selector) {
        out.push({ selector, body, offset: baseOffset + i, forcedColors: inForcedColors });
      }
      i = j;
      continue;
    }
    if (ch === '}') {
      buffer = '';
      i += 1;
      continue;
    }
    buffer += ch;
    i += 1;
  }
  return out;
}

function walkCss(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkCss(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

/* Split a selector list into its individual selectors. */
function selectorParts(selector) {
  return selector.split(',').map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/* An outline value that paints nothing. */
function isInvisibleOutline(value) {
  const v = value.replace(/!\s*important/gi, '').trim().toLowerCase();
  if (v === 'none' || v === '0' || v === '0px') return true;
  if (v.includes('transparent')) return true;
  /* A colour-mix with a transparent component paints nothing either. */
  return /color-mix\([^)]*transparent/.test(v);
}

function main() {
  const failures = [];
  const themesRaw = readFileSync(THEMES_CSS, 'utf8');
  const themes = stripComments(themesRaw);

  /* ---------- 1. the contract token ---------- */
  const focusVars = declarations(themes);
  const focusShadow = focusVars.get('--ui-focus-shadow');
  if (!focusShadow) {
    failures.push('themes.css: --ui-focus-shadow is missing — the focus ring has no token');
  } else {
    const layers = focusShadow.split(/,(?![^(]*\))/).map((part) => part.trim()).filter(Boolean);
    if (layers.length !== 2) {
      failures.push(
        `themes.css: --ui-focus-shadow has ${layers.length} layer(s), expected 2 (a page-coloured gap plus a ring)`,
      );
    }
    if (!/var\(--ui-bg-page\)/.test(layers[0] || '')) {
      failures.push('themes.css: the inner layer of --ui-focus-shadow must be the page colour — it is the gap between the two rings');
    }
    if (!/var\(--ui-focus-ring\)/.test(layers[1] || '')) {
      failures.push('themes.css: the outer layer of --ui-focus-shadow must be --ui-focus-ring');
    }
    const spreads = layers.map((layer) => Number.parseFloat((/(\d+(?:\.\d+)?)px/.exec(layer) || [])[1]));
    if (spreads.some((value) => !Number.isFinite(value))) {
      failures.push('themes.css: every layer of --ui-focus-shadow needs an explicit px spread');
    } else if (spreads[1] <= spreads[0]) {
      failures.push(
        `themes.css: the ring layer (${spreads[1]}px) must sit outside the gap layer (${spreads[0]}px)`,
      );
    }
  }

  /* ---------- 2. the ring colour and its contrast ---------- */
  const ringRaw = focusVars.get('--ui-focus-ring');
  let ringRgb = null;
  let ringAlpha = 1;
  if (!ringRaw) {
    failures.push('themes.css: --ui-focus-ring is missing');
  } else {
    const mix = /color-mix\(\s*in srgb\s*,\s*var\(\s*(--[\w-]+)\s*\)\s*([\d.]+)%\s*,\s*transparent\s*\)/.exec(ringRaw);
    if (!mix) {
      failures.push(
        `themes.css: --ui-focus-ring is "${ringRaw}" — expected color-mix(in srgb, var(--ui-text-primary) N%, transparent)`,
      );
    } else {
      ringAlpha = Number.parseFloat(mix[2]) / 100;
      const sourceName = mix[1];
      for (const mode of ['dark', 'light']) {
        const body = ruleBody(themes, `[data-mode="${mode}"]`);
        if (!body) continue;
        const vars = declarations(body);
        const source = resolveValue(vars.get(sourceName) || '', vars);
        const rgb = hexToRgb(source);
        if (!rgb) continue;
        const ladder = {};
        for (const rung of RUNGS) {
          const raw = vars.get(`--ui-bg-${rung}`);
          if (!raw) continue;
          const resolved = resolveValue(raw, vars);
          const rungRgb = hexToRgb(resolved);
          if (rungRgb) ladder[rung] = rungRgb;
        }
        const minContrast = Math.min(
          ...Object.entries(ladder).map(([rung, bg]) => {
            const over = composite(rgb, ringAlpha, bg);
            const ratio = contrastRatio(over, bg);
            if (ratio < requiredContrast) {
              failures.push(
                `themes.css: the ${mode} focus ring is ${ratio.toFixed(2)}:1 on --ui-bg-${rung} — it must clear ${requiredContrast}:1`,
              );
            }
            return ratio;
          }),
        );
        if (!ringRgb) ringRgb = rgb;
        ratios[mode] = minContrast;
      }
    }
  }

  /* ---------- 3. the global contract in the foundations layer ---------- */
  const baseRaw = readFileSync(BASE_CSS, 'utf8');
  const baseRules = parseRules(stripComments(baseRaw));
  const contract = baseRules.find(
    (rule) => rule.selector === ':focus-visible',
  );
  if (!contract) {
    failures.push('foundations/base.css: no :focus-visible rule — the global focus contract is missing');
  } else {
    if (!/box-shadow\s*:\s*var\(--ui-focus-shadow\)/.test(contract.body)) {
      failures.push('foundations/base.css: the :focus-visible contract must paint var(--ui-focus-shadow)');
    }
    const outline = /outline\s*:\s*([^;]+)/.exec(contract.body);
    if (!outline || !isInvisibleOutline(outline[1])) {
      failures.push(
        'foundations/base.css: the :focus-visible outline must stay transparent — a painted outline would read as a third ring',
      );
    }
  }

  /* ---------- 4. nothing else may paint a focus ring ---------- */
  const violations = [];
  let forcedFallbacks = 0;
  /* Rules that erase the outline outright with !important also erase the
   * UA's forced-colours outline, so each of them owes a forced-colours
   * counterpart. */
  const suppressed = [];
  const forcedSelectors = new Set();
  for (const file of walkCss(STYLES)) {
    const rel = relative(STYLES, file).split(sep).join('/');
    const raw = readFileSync(file, 'utf8');
    /*
     * The stripped copy keeps every newline, so a line number read off it
     * is the line number in the raw file — but its character offsets are
     * shorter than the raw ones, because a comment is really deleted.
     * Offsets therefore have to be resolved against the stripped copy.
     */
    const stripped = stripComments(raw);
    const rules = parseRules(stripped);
    for (const rule of rules) {
      if (!rule.selector.includes(':focus')) continue;
      /* A pseudo-element paints its own detail — a range thumb's ring, a
       * rail tooltip's shadow — and it is not the focus ring on the control
       * itself, so it is out of scope here. */
      if (rule.selector.includes('::')) continue;
      /* The body starts right after the `{`, so a declaration's own line is
       * the rule's line plus the newlines that precede it in the body. */
      const lineOf = (index) => stripped.slice(0, rule.offset + 1 + index).split('\n').length;

      for (const match of rule.body.matchAll(/outline(?:-color)?\s*:\s*([^;]+)/g)) {
        const value = match[1];
        const line = lineOf(match.index);
        /* Inside forced colours the indicator is painted with the system
         * colour on purpose — that is the fallback, not a second ring. */
        if (rule.forcedColors) {
          forcedFallbacks += 1;
          for (const part of selectorParts(rule.selector)) forcedSelectors.add(part);
          continue;
        }
        if (!isInvisibleOutline(value)) {
          violations.push(
            `${rel}:${line}  paints a focus outline (${value.trim()}) — ${rule.selector.replace(/\s+/g, ' ').slice(0, 70)}`,
          );
        }
        /* An !important outline that paints nothing still beats the UA's
         * forced-colours outline, so it owes a forced-colours counterpart
         * just like `outline: none` does. */
        if (/!important/i.test(value) && isInvisibleOutline(value)) {
          for (const part of selectorParts(rule.selector)) {
            suppressed.push({ rel, line, selector: part });
          }
        }
      }

      for (const match of rule.body.matchAll(/box-shadow\s*:\s*([^;]+)/g)) {
        const value = match[1].trim();
        if (value.includes('--ui-focus-shadow')) continue;
        const exemption = SHADOW_EXEMPTIONS.find((entry) => entry.match.test(rule.selector));
        if (exemption) continue;
        violations.push(
          `${rel}:${lineOf(match.index)}  paints its own focus shadow (${value.replace(/\s+/g, ' ').slice(0, 60)}) — ${rule.selector.replace(/\s+/g, ' ').slice(0, 70)}`,
        );
      }
    }
  }
  for (const violation of violations) failures.push(violation);

  /* A doubled `!important` invalidates the whole declaration, so whatever
   * it was meant to pin silently disappears. It is easy to produce by
   * appending the flag to a value that already carries it. */
  for (const file of walkCss(STYLES)) {
    const rel = relative(STYLES, file).split(sep).join('/');
    const raw = readFileSync(file, 'utf8');
    stripComments(raw).split('\n').forEach((line, index) => {
      if (/!\s*important[^;]*!\s*important/i.test(line)) {
        failures.push(`${rel}:${index + 1}  declares !important twice — the declaration is invalid`);
      }
    });
  }

  /* ---------- 5. the forced-colours fallback ---------- */
  if (forcedFallbacks === 0) {
    failures.push(
      'styles: no forced-colors fallback — the ring is a box-shadow, and forced colours strips box-shadow',
    );
  }
  for (const entry of suppressed) {
    const covered = [...forcedSelectors].some(
      (forced) => forced === entry.selector
        || forced.includes(entry.selector)
        || entry.selector.includes(forced),
    );
    if (!covered) {
      failures.push(
        `${entry.rel}:${entry.line}  erases the focus outline with !important but has no forced-colors counterpart — ${entry.selector.slice(0, 80)}`,
      );
    }
  }

  /* ---------- baseline ---------- */
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  if (UPDATE) {
    const next = { minContrast: requiredContrast, generatedBy: 'check-focus-ring.mjs --update' };
    writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
    console.log('focus-ring baseline updated:');
    console.log(JSON.stringify(next, null, 2));
  } else if (!baseline) {
    failures.push('scripts/focus-ring.baseline.json is missing — run with --update');
  } else if (baseline.minContrast > requiredContrast) {
    failures.push(
      `focus ring: baseline demands ${baseline.minContrast}:1 but the check enforces ${requiredContrast}:1`,
    );
  }

  if (failures.length) {
    console.error('focus-ring check FAILED:');
    for (const failure of failures) console.error('  - ' + failure);
    process.exitCode = 1;
    return;
  }

  const summary = ['dark', 'light']
    .map((mode) => `${mode} ${ratios[mode]?.toFixed(2)}:1`)
    .join(' | ');
  console.log(`focus-ring check passed (${summary}, threshold ${requiredContrast}:1).`);
}

let requiredContrast = DEFAULT_MIN_CONTRAST;
const ratios = {};

/* Read the required threshold before main() so the baseline can raise it. */
if (existsSync(BASELINE)) {
  try {
    const parsed = JSON.parse(readFileSync(BASELINE, 'utf8'));
    if (Number.isFinite(parsed.minContrast)) requiredContrast = parsed.minContrast;
  } catch {
    /* fall back to the default */
  }
}

if (process.argv[1] && process.argv[1].endsWith('check-focus-ring.mjs')) {
  main();
}
