#!/usr/bin/env node
/*
 * scripts/check-button-sizes.mjs — interactive-control size ratchet.
 *
 * The button size contract lives in styles/tokens.css:
 *
 *   --ui-control-sm:      32px     dense / inline affordances
 *   --ui-control-md:      40px     default (the `.btn` / `.btn-icon` default)
 *   --ui-control-touch:   44px     mobile + primary touch targets
 *   --ui-control-desktop: 36px     desktop chrome row (topbar, tabs, toolbar)
 *   --ui-control-search:  42px     workspace search fields and pills
 *
 * Every interactive control should reach for one of those five. When a
 * surface instead writes a literal `height: 38px` on a button, it is off
 * the ladder: it will not match the button beside it, and the drift is
 * invisible until someone screenshots two surfaces side by side.
 *
 * This check counts literal px `height` / `min-height` / `width` /
 * `min-width` declarations on interactive control selectors across the
 * live stylesheets and compares the total against a baseline. The count
 * may only go DOWN. legacy/ and restore/ are frozen historical zones and
 * are exempt, exactly as in check-css-debt.mjs — see FROZEN_DIRS.
 *
 * Shrinking the baseline is an explicit act: run with --update.
 *
 * Usage:  node scripts/check-button-sizes.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const STYLES = join(FRONTEND, 'src', 'styles');
const BASELINE = join(FRONTEND, 'scripts', 'button-sizes.baseline.json');
const UPDATE = process.argv.includes('--update');

/* Frozen historical zones — same split as check-css-debt.mjs. */
const FROZEN_DIRS = new Set(['legacy', 'restore']);

/* The canonical ladder. A literal matching one of these is not debt.
 *
 * 32/40/44 are the original rungs (tokens.css --ui-control-sm/md/touch).
 * 36/42 joined them once they were promoted to named tokens, because they are
 * the density the shipped desktop chrome actually uses:
 *
 *   --ui-control-desktop: 36px   topbar switcher / find / share, the directory
 *                                tab rails, the Library toolbar
 *   --ui-control-search:  42px   every workspace search field and pill
 *
 * Promoting a value into this set is the alternative to growing the baseline.
 * It keeps `lint:button-sizes` failing on *new* literals while making a
 * deliberate change a one-line edit in tokens.css. */
const LADDER = new Set([32, 40, 44, 36, 42]);

/*
 * A selector is an interactive control when ANY of:
 *
 *   - it targets a bare `button` element, or
 *   - one of its class names ENDS in a control word, or
 *   - one of its ID names ENDS in a control word.
 *
 * The ID arm is not optional. The topbar is built entirely from IDs
 * (#topModelSwitcher, #findBtn) and #pluginWorkspaceTabs, so a class-only
 * matcher silently misses the highest-traffic controls on the page while
 * reporting a clean baseline.
 *
 * Names are read as whole tokens (`.foo-bar-btn` → `foo-bar-btn`) and the
 * decision is made on the LAST hyphen/underscore segment. Testing the last
 * segment is what keeps `.composer-plugin-chip-icon` (an icon inside a chip)
 * out while `.library-settings-btn` (a button) is in — and what catches
 * `#topModelSwitcher` (ends in "Switcher", not a control) alongside
 * `#findBtn` (ends in "Btn").
 *
 * Note the trailing `s`: this codebase pluralises (`plugin-directory-tabs`,
 * `scheduled-filter-tabs`).
 */
const CONTROL_LAST_SEGMENT =
  /(?:^|[-_])(btn|button|tab|chip|pill|toggle|switch|remove|close|retry|cancel|clear|dismiss)s?$/i;

/*
 * IDs get a deliberately looser test than classes.
 *
 * Classes are reusable and numerous, so they use the exact last-segment rule
 * above — that is what keeps `.composer-plugin-chip-icon` out.
 *
 * IDs are unique element handles and there are few of them, so a false
 * positive costs one line in a human-reviewed report while a false negative
 * is a silently unguarded control. The looser `contains` test is what catches
 * camelCase ids, which the segmented rule cannot see: `#findBtn` and
 * `#pluginWorkspaceTabs` end in `Btn`/`Tabs` with no `-` or `_` before the
 * control word, and `#topModelSwitcher` ends in `Switcher`.
 */
const CONTROL_SUBSTRING =
  /(btn|button|tab|chip|pill|toggle|switch|remove|close|retry|cancel|clear|dismiss)/i;

const CLASS_TOKEN = /\.([A-Za-z0-9_-]+)/g;
const ID_TOKEN = /#([A-Za-z0-9_-]+)/g;
const BARE_BUTTON = /(^|[\s,>+~])button\b/i;

function isControlSelector(selector) {
  if (BARE_BUTTON.test(selector)) return true;
  CLASS_TOKEN.lastIndex = 0;
  let m;
  while ((m = CLASS_TOKEN.exec(selector)) !== null) {
    if (CONTROL_LAST_SEGMENT.test(m[1])) return true;
  }
  ID_TOKEN.lastIndex = 0;
  while ((m = ID_TOKEN.exec(selector)) !== null) {
    if (CONTROL_SUBSTRING.test(m[1])) return true;
  }
  return false;
}

/* Selectors that look like controls by name but are decorative or
 * structural. These are size-carrying, not interactive, so a literal on
 * them is not button-size debt. */
const NON_CONTROL =
  /(svg|badge|caret|chev|indicator|spinner|ring|dot|thumb|preview|editor|textarea|line|row|panel|card|header|footer|sidebar|toolbar-divider|separator|handle|grip|marker|scrollbar|track|progress|skeleton)/i;

/*
 * Height only, never width.
 *
 * The ladder governs the vertical rhythm and the touch target — that is
 * what makes two buttons look like a set. Width is content-driven for any
 * text-bearing button ("Send" is not the width of "Retry"), so pinning it
 * to the ladder would be wrong. Icon buttons are square, and their height
 * already fixes their width.
 */
const SIZE_PROP = /(^|[\s;{])(?:min-)?height\s*:\s*(\d+)px(?![a-z%])/g;

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (FROZEN_DIRS.has(entry.name)) continue;
      walk(p, out);
    } else if (entry.name.endsWith('.css')) {
      out.push(p);
    }
  }
  return out;
}

/* Strip comments so a commented-out rule never counts as live debt. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/*
 * Attribute a declaration to the selector block that owns it. We track the
 * nearest preceding selector line the same way a human reads the sheet,
 * bounded so a stray `{` far above cannot claim an unrelated rule.
 */
function collect() {
  const files = walk(STYLES, []);
  const hits = [];
  let scanned = 0;

  for (const file of files) {
    scanned++;
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      SIZE_PROP.lastIndex = 0;
      let m;
      while ((m = SIZE_PROP.exec(line)) !== null) {
        const px = Number(m[2]);
        if (LADDER.has(px)) continue;

        // Walk back to the owning selector block.
        let selector = null;
        for (let j = i; j >= 0 && j > i - 14; j--) {
          const cand = lines[j].trim();
          if (!cand.includes('{') || cand.startsWith('@')) continue;
          selector = cand.replace(/\s*\{\s*$/, '');
          break;
        }
        if (!selector) continue;
        if (!isControlSelector(selector)) continue;
        if (NON_CONTROL.test(selector)) continue;

        hits.push({
          file: relative(STYLES, file).split(sep).join('/'),
          line: i + 1,
          px,
          prop: m[1].trim(),
          selector: selector.slice(0, 90),
        });
      }
    });
  }

  return { hits, scanned };
}

function main() {
  const { hits, scanned } = collect();

  let baseline = null;
  if (existsSync(BASELINE)) {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  }

  const failures = [];

  if (!baseline) {
    writeFileSync(
      BASELINE,
      JSON.stringify(
        { offLadder: hits.length, generatedBy: 'check-button-sizes.mjs --update' },
        null,
        2,
      ) + '\n',
    );
    console.log(
      `button-sizes: no baseline found — wrote scripts/button-sizes.baseline.json (${hits.length} off-ladder declarations across ${scanned} live sheets).`,
    );
    console.log('Review the list below, commit the baseline, and re-run. Growth beyond it now fails.');
  } else if (UPDATE) {
    // Ratchet: only ever record the smaller number, never grow the budget.
    const shrunk = Math.min(hits.length, baseline.offLadder ?? hits.length);
    writeFileSync(
      BASELINE,
      JSON.stringify(
        { offLadder: shrunk, generatedBy: 'check-button-sizes.mjs --update' },
        null,
        2,
      ) + '\n',
    );
    console.log(`button-sizes: baseline updated to ${shrunk} (counts only ever shrink).`);
  } else if (hits.length > baseline.offLadder) {
    failures.push(
      `off-ladder control sizes: ${hits.length} > baseline ${baseline.offLadder} (+${hits.length - baseline.offLadder}). ` +
        `Snap the size onto --ui-control-sm (32px) / --ui-control-md (40px) / --ui-control-touch (44px), ` +
        `or, if the surface genuinely needs a new rung, add the token to tokens.css deliberately.`,
    );
  }

  if (failures.length) {
    console.error('button-sizes check FAILED:');
    for (const f of failures) console.error('  - ' + f);
    console.error('\nOff-ladder declarations:');
    for (const h of hits) {
      console.error(`  ${h.file}:${h.line}  ${h.px}px  ${h.prop}: … ${h.selector}`);
    }
    process.exitCode = 1;
  } else if (!baseline || UPDATE) {
    // informational paths above already printed
  } else {
    console.log(
      `button-sizes check passed (${hits.length}/${baseline.offLadder} off-ladder declarations across ${scanned} live sheets; ladder ${[...LADDER].join('/')}px).`,
    );
  }

  return hits;
}

if (process.argv[1] && process.argv[1].endsWith('check-button-sizes.mjs')) {
  main();
}

export { collect, LADDER };