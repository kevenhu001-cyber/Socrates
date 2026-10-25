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
 * The band above is a sanity net rather than the contract. The contract is
 * that the four rungs are a *consecutive slice of the Geist scale*: every
 * rung is a tone the design system actually ships, and the ladder is one
 * slice of one scale rather than four unrelated greys that happen to be
 * close together. That is why the scale is embedded below and why the
 * baseline records the Geist step each rung is cut from.
 *
 * Dark mode runs the ladder upwards (L1 darkest). Light mode runs it the
 * other way, and the canvas is *not* the top rung there: the paper (L1) is
 * what raised surfaces are cut from, so a composer or a dialog reads as
 * lighter than the page it stands on. The rung order is the same in both
 * modes; what changes is which tone the canvas gets.
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
 * This check resolves all four and fails when they disagree, when a rung
 * leaves the 1.5%-3% band, when a rung count changes, or when pure black
 * appears on the ladder.
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
 * sanity net, not the contract: the contract is that the rungs are four
 * consecutive steps of the Geist ramp (see GEIST_SURFACES). The band only
 * catches a rung that was moved somewhere the scale does not have a step
 * for, so it is wide enough to hold Geist's own gap between its page tone
 * and the gray ramp. */
const MIN_STEP = 1.5;
const MAX_STEP = 7.0;

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
 * baseline overrides it; this is the fallback for a missing baseline. */
const DEFAULT_LEGACY_CHANNELS = {
  dark: {
    '--bg-000': 'page',
    '--bg-100': 'rail',
    '--bg-200': 'panel',
    '--bg-300': 'elevated',
  },
  light: {
    '--bg-000': 'page',
    '--bg-100': 'rail',
    '--bg-200': 'panel',
    '--bg-300': 'elevated',
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

/* Perceived lightness as a percentage — the same weighting used by the
 * palette notes in themes.css. */
function lightness(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 * 100;
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

function main() {
  const failures = [];
  const css = stripComments(readFileSync(THEMES_CSS, 'utf8'));
  const sharedTokens = readFileSync(SHARED_TOKENS, 'utf8');
  const sharedRn = readFileSync(SHARED_RN, 'utf8');

  const ladder = { dark: {}, light: {} };

  for (const mode of ['dark', 'light']) {
    const body = ruleBody(css, `[data-mode="${mode}"]`);
    if (!body) {
      failures.push(`themes.css: no [data-mode="${mode}"] rule found`);
      continue;
    }
    const vars = declarations(body);
    for (const rung of RUNGS) {
      const raw = vars.get(`--ui-bg-${rung}`);
      if (!raw) {
        failures.push(`themes.css: [data-mode="${mode}"] is missing --ui-bg-${rung}`);
        continue;
      }
      const resolved = resolveValue(raw, vars);
      if (!/^#[0-9a-fA-F]{6}$/.test(resolved)) {
        failures.push(`themes.css: --ui-bg-${rung} resolves to "${resolved}", expected a 6-digit hex`);
        continue;
      }
      ladder[mode][rung] = resolved.toLowerCase();
    }
  }

  /* Structural properties of the ladder itself. */
  for (const mode of ['dark', 'light']) {
    const rungs = RUNGS.map((rung) => ladder[mode]?.[rung]).filter(Boolean);
    if (rungs.length !== RUNGS.length) continue;

    if (new Set(rungs).size !== RUNGS.length) {
      failures.push(`themes.css: ${mode} ladder has duplicate rungs — ${rungs.join(', ')}`);
    }
    if (rungs.includes('#000000')) {
      failures.push(`themes.css: ${mode} ladder uses pure black #000000 — the canvas must be a near-black`);
    }

    /* Every rung must be a tone the Geist scale actually ships, and the four
     * of them must be a consecutive slice of that scale. A ladder whose
     * rungs belong to no scale step is four unrelated colours that happen
     * to be close together. */
    const scale = GEIST_SURFACES[mode];
    const indices = rungs.map((rung) => scale.findIndex((entry) => entry.value === rung));
    if (indices.includes(-1)) {
      const unknown = rungs.filter((rung) => !scale.some((entry) => entry.value === rung));
      failures.push(
        `themes.css: ${mode} ladder rung ${unknown.join(', ')} is not a step of the Geist scale`,
      );
    } else {
      const sorted = [...indices].sort((a, b) => a - b);
      const consecutive = sorted.every((index, i) => i === 0 || index === sorted[i - 1] + 1);
      if (!consecutive) {
        failures.push(
          `themes.css: ${mode} ladder is not a consecutive slice of the Geist scale — it uses ${sorted.map((index) => scale[index].step).join(', ')}`,
        );
      }
    }

    /* The roles keep their meaning: the elevated rung is always the
     * lightest, and the canvas is the darkest in dark mode. In light mode
     * the paper (the elevated rung) deliberately sits *above* the canvas,
     * so a raised surface reads as lighter than the page it stands on. */
    const order = LIGHTNESS_ORDER[mode];
    for (let i = 1; i < order.length; i += 1) {
      const lower = ladder[mode]?.[order[i - 1]];
      const higher = ladder[mode]?.[order[i]];
      if (!lower || !higher) continue;
      if (lightness(lower) >= lightness(higher)) {
        failures.push(
          `themes.css: ${mode} ladder role order is wrong — ${order[i - 1]} (${lower}) is not darker than ${order[i]} (${higher})`,
        );
      }
    }

    const sortedRungs = [...rungs].sort((a, b) => lightness(a) - lightness(b));
    for (let i = 1; i < sortedRungs.length; i += 1) {
      const step = Math.abs(lightness(sortedRungs[i]) - lightness(sortedRungs[i - 1]));
      if (step < MIN_STEP - 0.01 || step > MAX_STEP + 0.01) {
        failures.push(
          `themes.css: ${mode} ladder step ${sortedRungs[i - 1]} → ${sortedRungs[i]} is ${step.toFixed(2)}%, outside the ${MIN_STEP}%-${MAX_STEP}% band`,
        );
      }
    }
  }

  /* The legacy HSL channels have to track the same rungs — the frozen
   * legacy/ tree composes them with hsl(), so a drifted channel paints a
   * tone the palette does not own. Which rung each channel carries is
   * declared in the baseline, because the legacy order (base → page →
   * raised → hover) is its own convention and does not follow the ladder's
   * role order in every mode. */
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  const legacyChannels = {
    dark: { ...DEFAULT_LEGACY_CHANNELS.dark, ...(baseline?.legacyChannels?.dark ?? {}) },
    light: { ...DEFAULT_LEGACY_CHANNELS.light, ...(baseline?.legacyChannels?.light ?? {}) },
  };

  for (const mode of ['dark', 'light']) {
    const body = ruleBody(css, `html[data-theme="socrates"][data-mode="${mode}"]`);
    if (!body) continue;
    const vars = declarations(body);
    const mapping = legacyChannels[mode];

    const mapped = Object.values(mapping);
    if (mapped.length !== RUNGS.length || new Set(mapped).size !== RUNGS.length) {
      failures.push(
        `themes.css: ${mode} legacy channel mapping must carry each of the four rungs exactly once (${JSON.stringify(mapping)})`,
      );
    }

    for (const [channel, rungName] of Object.entries(mapping)) {
      const raw = vars.get(channel);
      const rung = ladder[mode]?.[rungName];
      if (!raw || !rung) continue;
      /* The channel is an HSL triplet — `h s% l%` — so the lightness is the
       * third component, not the first percentage. */
      const parts = raw.trim().split(/\s+/);
      const channelLightness = Number.parseFloat(parts[2]);
      if (!Number.isFinite(channelLightness)) continue;
      const rungLightness = lightness(rung);
      if (Math.abs(channelLightness - rungLightness) > 0.05) {
        failures.push(
          `themes.css: ${mode} ${channel} is ${channelLightness}% but --ui-bg-${rungName} (${rung}) is ${rungLightness.toFixed(2)}%`,
        );
      }
    }
  }

  /* The shared package and the native projection have to carry the same
   * rungs as the web palette. */
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

  for (const mode of ['dark', 'light']) {
    for (const rung of RUNGS) {
      const webHex = ladder[mode]?.[rung];
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
    const rungHexes = new Set(RUNGS.map((rung) => ladder[mode]?.[rung]).filter(Boolean));
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
    const modeVars = declarations(ruleBody(css, `[data-mode="${mode}"]`) || '');
    for (const role of PRODUCT_ROLES) {
      const webRaw = modeVars.get(role.web);
      const native = rnSurfaces[mode]?.[role.native];
      if (!webRaw || !native) continue;
      const webHex = resolveValue(webRaw, modeVars).toLowerCase();
      /* Only a plain hex can be compared; a color-mix() stays opaque here. */
      if (!/^#[0-9a-f]{6}$/.test(webHex)) continue;
      if (webHex !== native.toLowerCase()) {
        failures.push(
          `packages/theme/src/rn.ts: ${mode} surfaces.${role.native} is ${native} but the web ${role.web} is ${webHex}`,
        );
      }
    }
  }

  if (UPDATE) {
    /* The baseline records the Geist step each rung is cut from, not just
     * its value: the step is the reviewable part of the decision, and the
     * value follows from it. */
    const next = {};
    for (const mode of ['dark', 'light']) {
      const scale = GEIST_SURFACES[mode];
      next[mode] = {};
      for (const rung of RUNGS) {
        const value = ladder[mode]?.[rung];
        const entry = scale.find((candidate) => candidate.value === value);
        next[mode][rung] = { step: entry?.step ?? null, value: value ?? null };
      }
    }
    next.legacyChannels = legacyChannels;
    next.generatedBy = 'check-surface-ladder.mjs --update';
    writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
    console.log('surface-ladder baseline updated:');
    console.log(JSON.stringify(next, null, 2));
  } else if (baseline) {
    for (const mode of ['dark', 'light']) {
      for (const rung of RUNGS) {
        const expectedEntry = baseline[mode]?.[rung];
        const expected = typeof expectedEntry === 'string' ? expectedEntry : expectedEntry?.value;
        const actual = ladder[mode]?.[rung];
        if (expected && actual && expected !== actual) {
          failures.push(
            `themes.css: ${mode} --ui-bg-${rung} is ${actual} but the baseline expects ${expected} — run with --update after a deliberate ladder change`,
          );
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

  const summary = ['dark', 'light']
    .map((mode) => `${mode}: ${RUNGS.map((rung) => `${rung} ${ladder[mode][rung]} ${lightness(ladder[mode][rung]).toFixed(2)}%`).join(' → ')}`)
    .join(' | ');
  console.log(`surface-ladder check passed (${summary}).`);
}

if (process.argv[1] && process.argv[1].endsWith('check-surface-ladder.mjs')) {
  main();
}
