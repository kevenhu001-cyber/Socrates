#!/usr/bin/env node
/*
 * scripts/check-font-weight.mjs — font-weight ratchet.
 *
 * The product contract for type weight:
 *
 *   1. every weight in the product is named, not spelled. A literal
 *      `font-weight: 500` is a second source of truth that the dark-mode
 *      override can never reach — and a half step like 450 is worse than
 *      inert, because the browser silently snaps it to a real face while
 *      the stylesheet still claims a weight that does not exist;
 *   2. light and dark themes keep the official component weights stable:
 *      medium 500 and bold 700; color mode does not change the type recipe;
 *   3. a weight token that no longer exists would resolve to nothing and
 *      silently fall back to the browser default, so every reference has
 *      to name a token that is defined.
 *
 * @font-face blocks are exempt: there `font-weight` declares which weights
 * a face covers, not what weight to paint.
 *
 * Usage:  node scripts/check-font-weight.mjs [--update]
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const STYLES = join(FRONTEND, 'src', 'styles');
const TOKENS_CSS = join(STYLES, 'tokens.css');
const THEMES_CSS = join(STYLES, 'themes.css');
const BASELINE = join(FRONTEND, 'scripts', 'font-weight.baseline.json');
const UPDATE = process.argv.includes('--update');

/* The weights the product is allowed to name. */
export const REQUIRED_TOKENS = ['regular', 'medium', 'semibold', 'bold'];

/* Official shadcn component weights are the same in both color modes. */
export const DARK_MEDIUM = 500;
export const DARK_BOLD = 700;

export function stripComments(text) {
  /* Comments are blanked rather than removed, so the line numbers the
   * violations report stay the line numbers in the file. */
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ''));
}

/* `400 !important` still names a literal weight. */
export function stripImportant(value) {
  return value.replace(/\s*!important\s*$/i, '').trim();
}

/*
 * Parse a stylesheet into flat rules, walking into nested at-rules.
 */
export function parseRules(css, baseOffset = 0, inFontFace = false) {
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
        const face = inFontFace || /^@font-face\b/.test(selector);
        out.push(...parseRules(body, baseOffset + i, face));
      } else if (selector) {
        out.push({ selector, body, offset: baseOffset + i, fontFace: inFontFace });
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

/* Collect `--name: value;` declarations from a rule body. */
export function declarations(body) {
  const out = new Map();
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!out.has(match[1])) out.set(match[1], match[2].trim());
  }
  return out;
}

/* Extract the body of a top-level rule whose selector matches. */
export function ruleBody(css, selector) {
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

/**
 * Scan one stylesheet for literal weights and weight-token references.
 *
 * The stripped copy keeps every newline, so a line number read off it is the
 * line number in the raw file — but its character offsets are shorter than the
 * raw ones, because a comment is really deleted. Offsets therefore have to be
 * resolved against the stripped copy.
 */
export function scanCss(raw) {
  const stripped = stripComments(raw);
  const literals = [];
  const references = [];
  for (const rule of parseRules(stripped)) {
    if (rule.fontFace) continue;
    /* The body starts right after the `{`, so a declaration's own line is the
     * rule's line plus the newlines that precede it in the body. */
    const lineOf = (index) => stripped.slice(0, rule.offset + 1 + index).split('\n').length;

    for (const match of rule.body.matchAll(/(?:^|[;{\s])font-weight\s*:\s*([^;}]+)/g)) {
      const value = stripImportant(match[1].trim());
      if (/^\d+$/.test(value)) {
        literals.push({ line: lineOf(match.index), value, kind: 'font-weight' });
      } else if (/^(bold|bolder|lighter|normal)$/i.test(value)) {
        /* A spelled weight is a second source of truth just like a number:
         * the dark-mode step-down can never reach it. */
        literals.push({ line: lineOf(match.index), value, kind: 'font-weight keyword' });
      } else {
        for (const ref of value.matchAll(/var\(\s*(--ui-font-weight-[\w-]+)\s*\)/g)) {
          references.push({ line: lineOf(match.index), token: ref[1] });
        }
      }
    }

    for (const match of rule.body.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}]+)/g)) {
      const value = stripImportant(match[1].trim());
      /*
       * Inside the shorthand the weight is the only bare three-digit number:
       * a size always carries a unit, and a unitless line-height follows a
       * `/`, so both are excluded.
       */
      for (const weight of value.matchAll(/(?<![\w.\-/])(\d{3})(?![\w.%])/g)) {
        literals.push({ line: lineOf(match.index), value: weight[1], kind: 'font shorthand' });
      }
      /*
       * `bold` / `bolder` / `lighter` are unambiguous weights in the
       * shorthand. `normal` is not: it may stand for the style, the variant
       * or the weight, so it is left alone.
       */
      for (const weight of value.matchAll(/(?:^|\s)(bold|bolder|lighter)(?=\s)/gi)) {
        literals.push({ line: lineOf(match.index), value: weight[1], kind: 'font shorthand keyword' });
      }
      for (const ref of value.matchAll(/var\(\s*(--ui-font-weight-[\w-]+)\s*\)/g)) {
        references.push({ line: lineOf(match.index), token: ref[1] });
      }
    }
  }
  return { literals, references };
}

/**
 * Check the token ladder and the dark-mode step-down.
 *
 * Returns the failures plus the set of weight tokens that exist.
 */
export function checkTokenLadder(tokensCss, themesCss) {
  const failures = [];
  const defined = new Set();

  const tokenBody = ruleBody(stripComments(tokensCss), ':root');
  if (!tokenBody) {
    failures.push('tokens.css: no :root rule found');
    return { failures, defined };
  }
  const tokenVars = declarations(tokenBody);
  for (const name of REQUIRED_TOKENS) {
    const prop = `--ui-font-weight-${name}`;
    if (!tokenVars.has(prop)) {
      failures.push(`tokens.css: ${prop} is missing`);
      continue;
    }
    defined.add(prop);
  }
  if (tokenVars.has('--ui-foundation-font-weight-strong')) {
    defined.add('--ui-foundation-font-weight-strong');
  }

  const darkBody = ruleBody(stripComments(themesCss), '[data-mode="dark"]');
  if (!darkBody) {
    failures.push('themes.css: no [data-mode="dark"] rule found');
    return { failures, defined };
  }
  const darkVars = declarations(darkBody);
  const medium = darkVars.get('--ui-font-weight-medium');
  const bold = darkVars.get('--ui-font-weight-bold');
  if (medium === undefined) {
    failures.push('themes.css: [data-mode="dark"] does not declare the official --ui-font-weight-medium');
  } else if (Number.parseFloat(medium) !== DARK_MEDIUM) {
    failures.push(`themes.css: dark --ui-font-weight-medium is ${medium}, expected ${DARK_MEDIUM}`);
  }
  if (bold === undefined) {
    failures.push('themes.css: [data-mode="dark"] does not declare the official --ui-font-weight-bold');
  } else if (Number.parseFloat(bold) !== DARK_BOLD) {
    failures.push(`themes.css: dark --ui-font-weight-bold is ${bold}, expected ${DARK_BOLD}`);
  }
  return { failures, defined };
}

function main() {
  const failures = [];

  /* ---------- the token ladder and the dark-mode step-down ---------- */
  const { failures: ladderFailures, defined } = checkTokenLadder(
    readFileSync(TOKENS_CSS, 'utf8'),
    readFileSync(THEMES_CSS, 'utf8'),
  );
  failures.push(...ladderFailures);

  /* ---------- no literal weights outside @font-face ---------- */
  let literalCount = 0;
  const references = [];
  for (const file of walkCss(STYLES)) {
    const rel = relative(STYLES, file).split(sep).join('/');
    const scan = scanCss(readFileSync(file, 'utf8'));
    for (const literal of scan.literals) {
      literalCount += 1;
      failures.push(
        `${rel}:${literal.line}  literal ${literal.kind} weight ${literal.value} — name the weight with a token`,
      );
    }
    for (const ref of scan.references) references.push({ rel, ...ref });
  }

  /* ---------- every referenced token has to exist ---------- */
  for (const ref of references) {
    if (!defined.has(ref.token)) {
      failures.push(`${ref.rel}:${ref.line}  references ${ref.token}, which is not defined`);
    }
  }

  /* ---------- baseline ---------- */
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  if (UPDATE) {
    const next = { literalWeights: literalCount, generatedBy: 'check-font-weight.mjs --update' };
    writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
    console.log('font-weight baseline updated:');
    console.log(JSON.stringify(next, null, 2));
  } else if (!baseline) {
    failures.push('scripts/font-weight.baseline.json is missing — run with --update');
  } else if (literalCount > baseline.literalWeights) {
    failures.push(
      `literal font weights: ${literalCount} > baseline ${baseline.literalWeights} (+${literalCount - baseline.literalWeights}) — name the weight with a token`,
    );
  }

  if (failures.length) {
    console.error('font-weight check FAILED:');
    for (const failure of failures) console.error('  - ' + failure);
    process.exitCode = 1;
    return;
  }

  console.log(
    `font-weight check passed (0 literal weights outside @font-face, ${references.length} token references, dark medium ${DARK_MEDIUM} / bold ${DARK_BOLD}).`,
  );
}

if (process.argv[1] && process.argv[1].endsWith('check-font-weight.mjs')) {
  main();
}
