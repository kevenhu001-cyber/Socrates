#!/usr/bin/env node
/*
 * scripts/check-surface-ladder.mjs — background-ladder ratchet.
 *
 * The product contract is a four-step background ladder:
 *
 *   L1  page      the canvas
 *   L2  rail      the sidebar / navigation rail
 *   L3  panel     panels, cards, code blocks
 *   L4  elevated  menus, composer, dialogs
 *
 * Three properties make it a ladder rather than an arbitrary palette:
 *
 *   1. exactly four surfaces, each with a job;
 *   2. consecutive rungs are 1.5%-7% apart in perceived lightness, so the
 *      layering reads as depth rather than as a colour change;
 *   3. the darkest rung is a near-black, never pure #000 — pure black crushes
 *      shadow detail and lets the lowest layer read as a hole punched
 *      through the UI.
 *
 * The band above is a sanity net rather than the contract. For a theme cut
 * from the Geist scale the stronger contract is that the four rungs are a
 * *consecutive slice of that scale*: every rung is a tone the design system
 * actually ships, and the ladder is one slice of one scale rather than four
 * unrelated greys that happen to be close together. A theme with its own
 * palette (warm parchment, say) has no scale to be a slice of, so the
 * baseline records `scale: null` for it and only the structural properties
 * above apply.
 *
 * Dark mode runs the ladder upwards (L1 darkest). Light mode runs it the
 * other way, and the canvas is *not* the top rung there: the paper (L1) is
 * what raised surfaces are cut from, so a composer or a dialog reads as
 * lighter than the page it stands on. The rung order is the same in both
 * modes; what changes is which tone the canvas gets.
 *
 * THEMES
 * ------
 * Themes are discovered from themes.css itself, not from a list kept
 * alongside it: every `html[data-theme="X"]` in the file is a theme, and a
 * theme that is added without a baseline entry fails this check. The runtime
 * list in src/displayPrefs.js is cross-checked against the discovered set,
 * so a theme registered in one place but not the other cannot slip through.
 *
 * A theme's palette is the CSS cascade of the generic `[data-mode="X"]`
 * block with that theme's own `html[data-theme="X"][data-mode="X"]` block on
 * top — the same way the browser resolves it. The generic block carries the
 * shared role aliases every theme inherits; the theme block overrides the
 * rungs it owns.
 *
 * The same four rungs have to exist in three places, or the Web app and the
 * Universal app drift apart the moment one side is touched:
 *
 *   frontend/src/styles/themes.css   the web palette (owner)
 *   frontend/src/styles/themes.css   the legacy HSL channels the frozen
 *                                    legacy/ tree composes with hsl()
 *   packages/theme/src/tokens.ts     the shared HSL source of truth
 *   packages/theme/src/rn.ts          the native hex projection
 *
 * Only the theme the baseline marks `shared: true` is mirrored into the
 * shared package and the native projection; a second theme is a web-only
 * palette until the Universal app grows a projection for it, and pretending
 * otherwise would make the guard demand a projection that does not exist.
 *
 * This check resolves all of it and fails when the parts disagree, when a
 * rung leaves the 1.5%-7% band, when a rung count changes, when pure black
 * appears on the ladder, when a theme is missing from the baseline, or when
 * the chat-surface bridge is only declared for one mode.
 *
 * The expected rungs live in a baseline that only moves through an explicit
 * `--update` run, so a deliberate ladder change is reviewable and an
 * accidental one is not. The baseline also declares which rung each legacy
 * HSL channel carries: the legacy tree's channel order (base → page → raised
 * → hover) is its own convention and does not follow the ladder's role
 * order, so the correspondence is stated rather than assumed.
 *
 * Usage:  node scripts/check-surface-ladder.mjs [--update]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const REPO = fileURLToPath(new URL('../../', import.meta.url));
const THEMES_CSS = join(FRONTEND, 'src', 'styles', 'themes.css');
const DISPLAY_PREFS = join(FRONTEND, 'src', 'displayPrefs.js');
const SHARED_TOKENS = join(REPO, 'packages', 'theme', 'src', 'tokens.ts');
const SHARED_RN = join(REPO, 'packages', 'theme', 'src', 'rn.ts');
const BASELINE = join(FRONTEND, 'scripts', 'surface-ladder.baseline.json');
const UPDATE = process.argv.includes('--update');

/* The ladder's rung names, in order, for both modes. */
const RUNGS = ['page', 'rail', 'panel', 'elevated'];

/* The roles ordered from the darkest rung to the lightest, per mode. Dark
 * runs upwards: the canvas is the floor and the elevated surfaces are the
 * ceiling. Light runs the other way and puts the paper at the top, so the
 * canvas is *not* the brightest rung — a raised surface has to read as
 * lighter than the page it stands on. */
const LIGHTNESS_ORDER = {
  dark: ['page', 'rail', 'panel', 'elevated'],
  light: ['panel', 'rail', 'page', 'elevated'],
};

/* The step band, in percentage points of perceived lightness. This is a
 * sanity net, not the contract: for a scale-based theme the contract is that
 * the rungs are four consecutive steps of the Geist ramp (see
 * GEIST_SURFACES). The band only catches a rung that was moved somewhere the
 * scale does not have a step for, so it is wide enough to hold Geist's own
 * gap between its page tone and the gray ramp. */
const MIN_STEP = 1.5;
const MAX_STEP = 7.0;

/* The chat-surface bridge. The frozen legacy chat surface composes these;
 * they are declared once per mode in themes.css and inherited by every
 * theme, so a theme only has to own the --ui-* roles they point at.
 *
 * The family used to be declared for dark mode only. Light mode then fell
 * back to the frozen hex palette inside restore/chat-surface.css, which
 * meant one mode tracked the ladder and the other did not. Both modes now
 * declare the family, and this check keeps it that way. */
const CHAT_BRIDGE = [
  '--chat-page',
  '--chat-surface',
  '--chat-control',
  '--chat-control-hover',
  '--chat-line',
  '--chat-text',
  '--chat-muted',
  '--chat-overlay',
];

/* The Geist surface ramp, per mode, in the order the scale itself runs:
 * the two background tones first (paper and canvas), then the ten grays
 * from the near-white inset tone down to the primary ink.
 *
 * The ladder must be four *consecutive* entries of this list. That is a
 * stronger statement than "four colours that happen to be close together":
 * it says every rung is a tone the design system actually ships, and that
 * the ladder is a slice of one scale rather than four unrelated greys. */
const GEIST_SURFACES = {
  light: [
    { step: 'background-100', value: '#ffffff' },
    { step: 'background-200', value: '#fafafa' },
    { step: 'gray-100', value: '#f2f2f2' },
    { step: 'gray-200', value: '#ebebeb' },
    { step: 'gray-300', value: '#e6e6e6' },
    { step: 'gray-400', value: '#eaeaea' },
    { step: 'gray-500', value: '#c9c9c9' },
    { step: 'gray-600', value: '#a8a8a8' },
    { step: 'gray-700', value: '#8f8f8f' },
    { step: 'gray-800', value: '#7d7d7d' },
    { step: 'gray-900', value: '#4d4d4d' },
    { step: 'gray-1000', value: '#171717' },
  ],
  dark: [
    { step: 'background-100', value: '#0a0a0a' },
    { step: 'gray-100', value: '#1a1a1a' },
    { step: 'gray-200', value: '#1f1f1f' },
    { step: 'gray-300', value: '#292929' },
    { step: 'gray-400', value: '#2e2e2e' },
    { step: 'gray-500', value: '#454545' },
    { step: 'gray-600', value: '#878787' },
    { step: 'gray-700', value: '#8f8f8f' },
    { step: 'gray-800', value: '#7d7d7d' },
    { step: 'gray-900', value: '#a1a1a1' },
    { step: 'gray-1000', value: '#ededed' },
  ],
};

/* Roles in the shared package that carry a ladder rung. The mapping is
 * mode-dependent: in dark mode the ladder runs upwards, so "panel" is the
 * raised-card rung and "elevated" is the overlay rung; in light mode the
 * paper is the top rung, so "elevated" is what the composer and the menus
 * are cut from and "panel" is the recessed control tone. `surfaces` only
 * exists in the native projection. */
const SHARED_RUNGS = {
  dark: {
    page: { group: 'bg', role: 'page' },
    rail: { group: 'surfaces', role: 'sidebar' },
    panel: { group: 'bg', role: 'raised' },
    elevated: { group: 'bg', role: 'overlay' },
  },
  light: {
    page: { group: 'bg', role: 'page' },
    rail: { group: 'surfaces', role: 'sidebar' },
    panel: { group: 'bg', role: 'sunken' },
    elevated: { group: 'surfaces', role: 'composer' },
  },
};

/* Which ladder rung each legacy HSL channel carries, per mode. The legacy
 * tree composes these channels with hsl(), so a channel that drifted off the
 * ladder paints a tone the palette does not own. The mapping is a bijection
 * over the four rungs — the legacy order (base → page → raised → hover) is
 * its own convention and does not follow the ladder's role order. The
 * baseline overrides it; this is the fallback for a missing baseline.
 *
 * The mapping is the same for every theme: each theme declares its own
 * channels in the same legacy order, so the order-to-rung correspondence
 * holds once and applies everywhere. */
const DEFAULT_LEGACY_CHANNELS = {
  dark: {
    '--bg-000': 'page',
    '--bg-100': 'rail',
    '--bg-200': 'panel',
    '--bg-300': 'elevated',
  },
  light: {
    '--bg-000': 'elevated',
    '--bg-100': 'page',
    '--bg-200': 'rail',
    '--bg-300': 'panel',
  },
};

/* Product roles that are not ladder rungs but still have to agree between
 * the web palette and the native projection — otherwise the Universal app
 * paints a different capsule from the one the Web app draws. */
const PRODUCT_ROLES = [
  { web: '--ui-bg-composer', native: 'composer' },
  { web: '--ui-bg-control', native: 'control' },
];

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

/* Extract the body of a top-level CSS rule whose selector matches. */
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

/* Overlay one declaration map on another. The second wins, which is how the
 * browser resolves a theme-scoped rule against the generic one. */
function mergeMaps(base, override) {
  const out = new Map(base);
  for (const [key, value] of override) out.set(key, value);
  return out;
}

/* Resolve `var(--x)` chains inside one declaration map. The whole
 * `var(--name)` token is replaced, closing parenthesis included, so a
 * reference resolves to a bare value rather than to `value)`. */
function resolveValue(value, vars, seen = new Set()) {
  if (!value.includes('var(')) return value;
  const match = /var\(\s*(--[\w-]+)\s*\)/.exec(value);
  if (!match || seen.has(match[1])) return value;
  seen.add(match[1]);
  const next = vars.get(match[1]);
  if (!next) return value;
  return resolveValue(value.replace(match[0], next), vars, new Set(seen));
}

function hexToRgb(hex) {
  const clean = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
}

/* Parse a colour literal into RGB. Both hex and the modern
 * `rgb(r g b)` / `rgba(r g b / a)` space-separated syntax are accepted —
 * a theme with its own palette writes warm tones that have no Geist hex to
 * borrow. */
function parseColor(value) {
  const text = value.trim();
  if (text.startsWith('#')) return hexToRgb(text);
  const rgb = /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(text);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((part) => Math.round(Number(part)));
  return null;
}

function rgbToHex(rgb) {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/* Perceived lightness as a percentage — the same weighting used by the
 * palette notes in themes.css. */
function lightness(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 * 100;
}

/* HSL lightness as a percentage — (max + min) / 2, which is what
 * `hsl(h s% l%)` actually means. The legacy channels are HSL triplets, so
 * comparing one against a rung has to use the same metric the triplet uses;
 * the weighted-RGB lightness above is a different number for any colour
 * that is not a grey. For a neutral grey the two agree exactly, so a
 * scale-based theme is unaffected by using this one here. */
function hslLightness(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  return ((max + min) / 2 / 255) * 100;
}

function hslToHex(value) {
  const [h, s, l] = value.split(/\s+/).map((part) => Number.parseFloat(part));
  const saturation = s / 100;
  const lightnessRatio = l / 100;
  const chroma = (1 - Math.abs(2 * lightnessRatio - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightnessRatio - chroma / 2;
  const sector = Math.floor(h / 60);
  const [r, g, b] = sector === 0 ? [chroma, x, 0]
    : sector === 1 ? [x, chroma, 0]
    : sector === 2 ? [0, chroma, x]
    : sector === 3 ? [0, x, chroma]
    : sector === 4 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/* Read the `bg` group out of a `darkPalette` / `lightPalette` declaration. */
function parseSharedPalette(source, constName) {
  const constBody = new RegExp(`const ${constName}[^=]*= \\{([\\s\\S]*?)\\n\\};`).exec(source);
  if (!constBody) return {};
  const bgBody = /\bbg:\s*\{([\s\S]*?)\n\s*\}/.exec(constBody[1]);
  if (!bgBody) return {};
  const out = {};
  for (const match of bgBody[1].matchAll(/^\s*(page|raised|overlay|hover|sunken):\s*'([^']+)'/gm)) {
    out[match[1]] = match[2];
  }
  return out;
}

function parseRnPalette(source, constName) {
  const block = new RegExp(`const ${constName}[^=]*= \\{([\\s\\S]*?)\\n\\};`).exec(source);
  if (!block) return {};
  const out = {};
  for (const match of block[1].matchAll(/^\s*(page|raised|overlay|hover|sunken):\s*'(#[0-9a-fA-F]{6})'/gm)) {
    out[match[1]] = match[2];
  }
  return out;
}

function parseRnSurfaces(source, constName) {
  const block = new RegExp(`const ${constName}[^=]*= \\{([\\s\\S]*?)\\n\\};`).exec(source);
  if (!block) return {};
  const out = {};
  for (const match of block[1].matchAll(/^\s*(sidebar|control|surface|composer|bubble):\s*'(#[0-9a-fA-F]{6})'/gm)) {
    out[match[1]] = match[2];
  }
  return out;
}

/* Every `html[data-theme="X"]` in themes.css is a theme. */
function discoverThemes(css) {
  const ids = new Set();
  for (const match of css.matchAll(/html\[data-theme="([^"]+)"\]/g)) ids.add(match[1]);
  return [...ids].sort();
}

/* The runtime theme list, so a theme registered in one place but not the
 * other cannot slip through. */
function runtimeThemes(source) {
  const match = /THEME_STYLES\s*=\s*\[([^\]]*)\]/.exec(source);
  if (!match) return null;
  return match[1].split(',').map((part) => part.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

function main() {
  const failures = [];
  const css = stripComments(readFileSync(THEMES_CSS, 'utf8'));
  const sharedTokens = readFileSync(SHARED_TOKENS, 'utf8');
  const sharedRn = readFileSync(SHARED_RN, 'utf8');
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;

  /* ── themes ─────────────────────────────────────────────────────────── */

  const themes = discoverThemes(css);
  if (themes.length === 0) {
    failures.push('themes.css: no html[data-theme="..."] rules found — the theme registry is empty');
  }

  const runtime = runtimeThemes(readFileSync(DISPLAY_PREFS, 'utf8'));
  if (!runtime) {
    failures.push('src/displayPrefs.js: THEME_STYLES not found — cannot cross-check the theme registry');
  } else {
    const missing = themes.filter((theme) => !runtime.includes(theme));
    const extra = runtime.filter((theme) => !themes.includes(theme));
    for (const theme of missing) {
      failures.push(`themes.css: theme "${theme}" has no runtime registration in src/displayPrefs.js THEME_STYLES`);
    }
    for (const theme of extra) {
      failures.push(`src/displayPrefs.js: THEME_STYLES registers "${theme}" but themes.css has no html[data-theme="${theme}"] rule`);
    }
  }

  /* A theme's palette is the generic mode block with the theme's own block
   * on top — the same way the browser resolves it. */
  const generic = {};
  for (const mode of ['dark', 'light']) {
    const body = ruleBody(css, `[data-mode="${mode}"]`);
    if (!body) {
      failures.push(`themes.css: no [data-mode="${mode}"] rule found`);
      continue;
    }
    generic[mode] = declarations(body);
  }

  const ladders = {};
  for (const theme of themes) {
    ladders[theme] = {};
    for (const mode of ['dark', 'light']) {
      const scoped = ruleBody(css, `html[data-theme="${theme}"][data-mode="${mode}"]`);
      const vars = mergeMaps(generic[mode] ?? new Map(), scoped ? declarations(scoped) : new Map());
      const rungHex = {};
      for (const rung of RUNGS) {
        const raw = vars.get(`--ui-bg-${rung}`);
        if (!raw) {
          failures.push(`themes.css: theme "${theme}" [data-mode="${mode}"] is missing --ui-bg-${rung}`);
          continue;
        }
        const resolved = resolveValue(raw, vars).trim();
        const rgb = parseColor(resolved);
        if (!rgb) {
          failures.push(`themes.css: theme "${theme}" --ui-bg-${rung} resolves to "${resolved}", expected a hex or rgb() colour`);
          continue;
        }
        rungHex[rung] = rgbToHex(rgb).toLowerCase();
      }
      ladders[theme][mode] = { vars, rungHex };
    }
  }

  /* ── the chat-surface bridge ───────────────────────────────────────── */

  /* The family has to exist in both generic mode blocks. It is declared
   * once per mode and inherited by every theme, so a theme only has to own
   * the --ui-* roles it points at. */
  for (const mode of ['dark', 'light']) {
    const vars = generic[mode];
    if (!vars) continue;
    for (const name of CHAT_BRIDGE) {
      if (!vars.has(name)) {
        failures.push(
          `themes.css: [data-mode="${mode}"] is missing ${name} — the chat-surface bridge has to be declared for both modes`,
        );
      }
    }
  }

  /* ── structural properties of each ladder ──────────────────────────── */

  for (const theme of themes) {
    const policy = baseline?.themes?.[theme];
    if (!policy) {
      failures.push(
        `scripts/surface-ladder.baseline.json has no entry for theme "${theme}" — run with --update after adding a theme`,
      );
      continue;
    }

    for (const mode of ['dark', 'light']) {
      const ladder = ladders[theme]?.[mode];
      if (!ladder) continue;
      const rungs = RUNGS.map((rung) => ladder.rungHex[rung]).filter(Boolean);
      if (rungs.length !== RUNGS.length) continue;

      if (new Set(rungs).size !== RUNGS.length) {
        failures.push(`themes.css: theme "${theme}" ${mode} ladder has duplicate rungs — ${rungs.join(', ')}`);
      }
      if (rungs.includes('#000000')) {
        failures.push(`themes.css: theme "${theme}" ${mode} ladder uses pure black #000000 — the canvas must be a near-black`);
      }

      /* A scale-based theme's rungs must be tones the Geist scale actually
       * ships, and the four of them must be a consecutive slice of that
       * scale. A theme with its own palette has no scale to be a slice of,
       * so the baseline records `scale: null` for it and only the
       * structural properties above apply. */
      if (policy.scale === 'geist') {
        const scale = GEIST_SURFACES[mode];
        const indices = rungs.map((rung) => scale.findIndex((entry) => entry.value === rung));
        if (indices.includes(-1)) {
          const unknown = rungs.filter((rung) => !scale.some((entry) => entry.value === rung));
          failures.push(
            `themes.css: theme "${theme}" ${mode} ladder rung ${unknown.join(', ')} is not a step of the Geist scale`,
          );
        } else {
          const sorted = [...indices].sort((a, b) => a - b);
          const consecutive = sorted.every((index, i) => i === 0 || index === sorted[i - 1] + 1);
          if (!consecutive) {
            failures.push(
              `themes.css: theme "${theme}" ${mode} ladder is not a consecutive slice of the Geist scale — it uses ${sorted.map((index) => scale[index].step).join(', ')}`,
            );
          }
        }
      } else if (policy.scale !== null && policy.scale !== undefined) {
        failures.push(`scripts/surface-ladder.baseline.json: theme "${theme}" has an unknown scale "${policy.scale}"`);
      }

      /* The roles keep their meaning: the elevated rung is always the
       * lightest, and the canvas is the darkest in dark mode. In light mode
       * the paper (the elevated rung) deliberately sits *above* the canvas,
       * so a raised surface reads as lighter than the page it stands on. */
      const order = LIGHTNESS_ORDER[mode];
      for (let i = 1; i < order.length; i += 1) {
        const lower = ladder.rungHex[order[i - 1]];
        const higher = ladder.rungHex[order[i]];
        if (!lower || !higher) continue;
        if (lightness(lower) >= lightness(higher)) {
          failures.push(
            `themes.css: theme "${theme}" ${mode} ladder role order is wrong — ${order[i - 1]} (${lower}) is not darker than ${order[i]} (${higher})`,
          );
        }
      }

      const sortedRungs = [...rungs].sort((a, b) => lightness(a) - lightness(b));
      for (let i = 1; i < sortedRungs.length; i += 1) {
        const step = Math.abs(lightness(sortedRungs[i]) - lightness(sortedRungs[i - 1]));
        if (step < MIN_STEP - 0.01 || step > MAX_STEP + 0.01) {
          failures.push(
            `themes.css: theme "${theme}" ${mode} ladder step ${sortedRungs[i - 1]} → ${sortedRungs[i]} is ${step.toFixed(2)}%, outside the ${MIN_STEP}%-${MAX_STEP}% band`,
          );
        }
      }

      /* The legacy HSL channels have to track the same rungs — the frozen
       * legacy/ tree composes them with hsl(), so a drifted channel paints a
       * tone the palette does not own. Which rung each channel carries is
       * declared in the baseline, because the legacy order (base → page →
       * raised → hover) is its own convention and does not follow the ladder's
       * role order in every mode.
       *
       * The channel is an HSL triplet, so it is compared against the rung's
       * HSL lightness — the same metric the triplet is written in. */
      const mapping = baseline?.legacyChannels?.[mode] ?? DEFAULT_LEGACY_CHANNELS[mode];
      const tolerance = policy.legacyTolerance ?? 0.05;

      const mapped = Object.values(mapping);
      if (mapped.length !== RUNGS.length || new Set(mapped).size !== RUNGS.length) {
        failures.push(
          `themes.css: ${mode} legacy channel mapping must carry each of the four rungs exactly once (${JSON.stringify(mapping)})`,
        );
      }

      for (const [channel, rungName] of Object.entries(mapping)) {
        const raw = ladder.vars.get(channel);
        const rung = ladder.rungHex[rungName];
        if (!raw || !rung) continue;
        /* The channel is an HSL triplet — `h s% l%` — so the lightness is the
         * third component, not the first percentage. */
        const parts = raw.trim().split(/\s+/);
        const channelLightness = Number.parseFloat(parts[2]);
        if (!Number.isFinite(channelLightness)) continue;
        const rungLightness = hslLightness(rung);
        if (Math.abs(channelLightness - rungLightness) > tolerance) {
          failures.push(
            `themes.css: theme "${theme}" ${mode} ${channel} is ${channelLightness}% but --ui-bg-${rungName} (${rung}) is ${rungLightness.toFixed(2)}%`,
          );
        }
      }
    }
  }

  /* ── the shared package and the native projection ──────────────────── */

  const sharedHsl = {
    dark: parseSharedPalette(sharedTokens, 'darkPalette'),
    light: parseSharedPalette(sharedTokens, 'lightPalette'),
  };
  const rnPalette = {
    dark: parseRnPalette(sharedRn, 'darkHex'),
    light: parseRnPalette(sharedRn, 'lightHex'),
  };
  const rnSurfaces = {
    dark: parseRnSurfaces(sharedRn, 'darkSurfaces'),
    light: parseRnSurfaces(sharedRn, 'lightSurfaces'),
  };

  for (const theme of themes) {
    const policy = baseline?.themes?.[theme];
    if (!policy?.shared) continue;

    for (const mode of ['dark', 'light']) {
      const ladder = ladders[theme]?.[mode];
      if (!ladder) continue;

      for (const rung of RUNGS) {
        const webHex = ladder.rungHex[rung];
        if (!webHex) continue;
        const target = SHARED_RUNGS[mode][rung];

        if (target.group === 'bg') {
          const hsl = sharedHsl[mode][target.role];
          if (!hsl) {
            failures.push(`packages/theme: ${mode} bg.${target.role} is missing`);
          } else {
            const sharedHex = hslToHex(hsl);
            if (sharedHex.toLowerCase() !== webHex) {
              failures.push(
                `packages/theme/src/tokens.ts: ${mode} bg.${target.role} is ${sharedHex} but the web ladder uses ${webHex}`,
              );
            }
          }
        }

        const nativeHex = target.group === 'surfaces'
          ? rnSurfaces[mode][target.role]
          : rnPalette[mode][target.role];
        if (!nativeHex) {
          failures.push(`packages/theme/src/rn.ts: ${mode} ${target.group}.${target.role} is missing`);
        } else if (nativeHex.toLowerCase() !== webHex) {
          failures.push(
            `packages/theme/src/rn.ts: ${mode} ${target.group}.${target.role} is ${nativeHex} but the web ladder uses ${webHex}`,
          );
        }
      }

      /* The native projection's own panel surfaces have to sit ON a rung, or
       * the Universal app drifts off the ladder while the web stays put. */
      const rungHexes = new Set(RUNGS.map((rung) => ladder.rungHex[rung]).filter(Boolean));
      for (const role of ['surface', 'composer']) {
        const hex = rnSurfaces[mode][role];
        if (hex && !rungHexes.has(hex.toLowerCase())) {
          failures.push(
            `packages/theme/src/rn.ts: ${mode} surfaces.${role} is ${hex}, which is not one of the ladder rungs (${[...rungHexes].join(', ')})`,
          );
        }
      }

      /* Product roles that are not ladder rungs still have to agree with the
       * web palette — otherwise the Universal app paints a different capsule
       * from the one the Web app draws. */
      for (const role of PRODUCT_ROLES) {
        const webRaw = ladder.vars.get(role.web);
        const native = rnSurfaces[mode]?.[role.native];
        if (!webRaw || !native) continue;
        const webHex = resolveValue(webRaw, ladder.vars).toLowerCase();
        /* Only a plain hex can be compared; a color-mix() stays opaque here. */
        if (!/^#[0-9a-f]{6}$/.test(webHex)) continue;
        if (webHex !== native.toLowerCase()) {
          failures.push(
            `packages/theme/src/rn.ts: ${mode} surfaces.${role.native} is ${native} but the web ${role.web} is ${webHex}`,
          );
        }
      }
    }
  }

  /* ── baseline ──────────────────────────────────────────────────────── */

  if (UPDATE) {
    /* The baseline records the Geist step each rung is cut from, not just
     * its value: the step is the reviewable part of the decision, and the
     * value follows from it. The scale / shared / tolerance policy is NOT
     * derived from the stylesheet — it is a decision, so an existing
     * baseline's policy is carried over and a theme the baseline has never
     * seen is recorded with no scale and no shared projection, which the
     * next reader has to review by hand. */
    const next = { themes: {} };
    const notices = [];
    for (const theme of themes) {
      const previous = baseline?.themes?.[theme];
      if (!previous) {
        notices.push(
          `theme "${theme}" is new: recorded with scale: null, shared: false, legacyTolerance: 0.5 — review and edit the baseline by hand if that is wrong`,
        );
      }
      next.themes[theme] = {
        scale: previous?.scale ?? null,
        shared: previous?.shared ?? false,
        legacyTolerance: previous?.legacyTolerance ?? 0.5,
      };
      for (const mode of ['dark', 'light']) {
        const scale = GEIST_SURFACES[mode];
        next.themes[theme][mode] = {};
        for (const rung of RUNGS) {
          const value = ladders[theme]?.[mode]?.rungHex[rung];
          const entry = scale.find((candidate) => candidate.value === value);
          next.themes[theme][mode][rung] = {
            step: entry?.step ?? null,
            value: value ?? null,
          };
        }
      }
    }
    next.legacyChannels = {
      dark: { ...DEFAULT_LEGACY_CHANNELS.dark, ...(baseline?.legacyChannels?.dark ?? {}) },
      light: { ...DEFAULT_LEGACY_CHANNELS.light, ...(baseline?.legacyChannels?.light ?? {}) },
    };
    next.generatedBy = 'check-surface-ladder.mjs --update';
    writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
    console.log('surface-ladder baseline updated:');
    console.log(JSON.stringify(next, null, 2));
    for (const notice of notices) console.log(`notice: ${notice}`);
  } else if (baseline) {
    for (const theme of themes) {
      const policy = baseline.themes?.[theme];
      if (!policy) continue;
      for (const mode of ['dark', 'light']) {
        for (const rung of RUNGS) {
          const expectedEntry = policy[mode]?.[rung];
          const expected = typeof expectedEntry === 'string' ? expectedEntry : expectedEntry?.value;
          const actual = ladders[theme]?.[mode]?.rungHex[rung];
          if (expected && actual && expected !== actual) {
            failures.push(
              `themes.css: theme "${theme}" ${mode} --ui-bg-${rung} is ${actual} but the baseline expects ${expected} — run with --update after a deliberate ladder change`,
            );
          }
        }
      }
    }
  } else {
    failures.push('scripts/surface-ladder.baseline.json is missing — run with --update');
  }

  if (failures.length) {
    console.error('surface-ladder check FAILED:');
    for (const failure of failures) console.error('  - ' + failure);
    process.exitCode = 1;
    return;
  }

  const summary = themes
    .map((theme) => {
      const modes = ['dark', 'light']
        .map((mode) => `${mode}: ${RUNGS.map((rung) => `${rung} ${ladders[theme]?.[mode]?.rungHex[rung]} ${lightness(ladders[theme]?.[mode]?.rungHex[rung]).toFixed(2)}%`).join(' → ')}`)
        .join(' | ');
      return `${theme} { ${modes} }`;
    })
    .join(' || ');
  console.log(`surface-ladder check passed (${summary}).`);
}

if (process.argv[1] && process.argv[1].endsWith('check-surface-ladder.mjs')) {
  main();
}
