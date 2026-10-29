/**
 * themePalette.test.mjs — the shared palette's own guarantees.
 *
 * This file used to live at packages/theme/src/palette.test.ts, where no
 * script ever ran it: the shared package resolves its imports extensionless
 * (Metro and Vite both want that), so `node --experimental-strip-types`
 * could not load it and the frontend's `test/*.test.mjs` glob never
 * reached it. The assertions were real but dead. They live here now, inside
 * the suite `npm run test:unit` actually executes.
 *
 * Three things are checked:
 *
 *   1. the HSL source of truth and the native hex projection agree — the
 *      projection is what the Universal app's native clients paint, so a
 *      drift there would make those clients disagree;
 *   2. the background ladder holds its shape — four rungs, evenly stepped in
 *      perceived lightness, and never a pure-black canvas;
 *   3. the Web compatibility tokens resolve through shadcn's semantic roles.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  darkPalette,
  lightPalette,
  resolveBackground,
} from '../../packages/theme/src/tokens.ts';
import { palettesHex, getUiSurfaceHex } from '../../packages/theme/src/rn.ts';

const THEMES_CSS = new URL('../src/styles/themes.css', import.meta.url);

/* The ladder's rungs, per mode, and where each one lives in the shared
 * package. Dark runs the ladder upwards, light runs it downwards, so the
 * role names differ per mode: in light mode the paper (the top rung) is
 * what the composer and the menus are cut from, and the bottom rung is the
 * recessed control tone. */
const RUNGS = {
  dark: [
    { name: 'page', bg: 'page', surfaces: null },
    { name: 'rail', bg: null, surfaces: 'sidebar' },
    { name: 'panel', bg: 'raised', surfaces: null },
    { name: 'elevated', bg: 'overlay', surfaces: null },
  ],
  light: [
    { name: 'page', bg: 'page', surfaces: null },
    { name: 'rail', bg: null, surfaces: 'sidebar' },
    { name: 'panel', bg: 'sunken', surfaces: null },
    { name: 'elevated', bg: null, surfaces: 'composer' },
  ],
};

/* The shared Universal palette keeps its own four-step compatibility ladder. */
const MIN_STEP = 1.5;
const MAX_STEP = 7.0;

function hslToHex(value) {
  const [h, s, l] = value.split(/\s+/).map((part) => Number.parseFloat(part));
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  const sector = Math.floor(h / 60);
  const [r, g, b] = sector === 0 ? [chroma, x, 0]
    : sector === 1 ? [x, chroma, 0]
    : sector === 2 ? [0, chroma, x]
    : sector === 3 ? [0, x, chroma]
    : sector === 4 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/* Perceived lightness as a percentage — the weighting the ladder's step
 * band is measured in. */
function lightnessPercent(hex) {
  const channels = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16));
  return (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) / 255 * 100;
}

function checkParity(palette, hex) {
  for (const group of ['accent', 'bg', 'text', 'border']) {
    for (const key of Object.keys(palette[group])) {
      assert.equal(hslToHex(palette[group][key]), hex[group][key], `${palette.mode}.${group}.${key}`);
    }
  }
  for (const key of ['muted', 'onAccent']) {
    assert.equal(hslToHex(palette[key]), hex[key], `${palette.mode}.${key}`);
  }
}

/* The shared package's value for one rung, in hex. */
function sharedRungHex(mode, rung) {
  const palette = palettesHex[mode];
  const surfaces = getUiSurfaceHex(mode);
  return rung.bg ? palette.bg[rung.bg] : surfaces[rung.surfaces];
}

test('HSL design tokens stay in parity with native hex palettes', () => {
  checkParity(darkPalette, palettesHex.dark);
  checkParity(lightPalette, palettesHex.light);
  assert.equal(resolveBackground('dark'), palettesHex.dark.bg.page);
  assert.equal(resolveBackground('light'), palettesHex.light.bg.page);
});

test('primary, secondary, and readable muted text meet WCAG AA for normal text', () => {
  for (const [mode, palette] of Object.entries(palettesHex)) {
    const background = palette.bg.page;
    for (const role of ['primary', 'secondary', 'muted']) {
      assert.ok(contrast(palette.text[role], background) >= 4.5, `${mode}.${role} contrast below 4.5:1`);
    }
  }
});

test('the background ladder is four rungs, evenly stepped, and never pure black', () => {
  for (const mode of ['dark', 'light']) {
    const rungs = RUNGS[mode].map((rung) => sharedRungHex(mode, rung));

    assert.equal(new Set(rungs).size, 4, `${mode} ladder must have four distinct rungs`);
    assert.ok(!rungs.includes('#000000'), `${mode} ladder must not use pure black`);

    const sorted = [...rungs].sort((a, b) => lightnessPercent(a) - lightnessPercent(b));
    for (let i = 1; i < sorted.length; i += 1) {
      const step = Math.abs(lightnessPercent(sorted[i]) - lightnessPercent(sorted[i - 1]));
      assert.ok(
        step >= MIN_STEP - 0.01 && step <= MAX_STEP + 0.01,
        `${mode} ladder step ${sorted[i - 1]} → ${sorted[i]} is ${step.toFixed(2)}%, outside ${MIN_STEP}%-${MAX_STEP}%`,
      );
    }
  }
});

test('every text tier clears AA on every ladder rung', () => {
  for (const mode of ['dark', 'light']) {
    const palette = palettesHex[mode];
    for (const rung of RUNGS[mode]) {
      const background = sharedRungHex(mode, rung);
      for (const role of ['primary', 'secondary', 'tertiary']) {
        const ratio = contrast(palette.text[role], background);
        assert.ok(
          ratio >= 4.5,
          `${mode}.${role} on the ${rung.name} rung (${background}) is ${ratio.toFixed(2)}:1, below 4.5:1`,
        );
      }
    }
  }
});

test('the semantic tones clear AA on every ladder rung', () => {
  /* danger and success are text colours too — the tool-card error value and
     the metric chip paint them on the ladder and on a 16% tint of
     themselves. A tone that reads on the canvas can still fail on the
     raised rung, which is where the dialogs and the cards live. */
  for (const mode of ['dark', 'light']) {
    const palette = palettesHex[mode];
    for (const rung of RUNGS[mode]) {
      const background = sharedRungHex(mode, rung);
      for (const role of ['danger', 'success']) {
        const ratio = contrast(palette[role], background);
        assert.ok(
          ratio >= 4.5,
          `${mode}.${role} on the ${rung.name} rung (${background}) is ${ratio.toFixed(2)}:1, below 4.5:1`,
        );
      }
    }
  }
});

test('the Web compatibility palette resolves through shadcn semantic roles', async () => {
  const css = (await readFile(THEMES_CSS, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');

  for (const mode of ['dark', 'light']) {
    const rule = new RegExp(`\\[data-mode="${mode}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
    assert.ok(rule, `themes.css has no [data-mode="${mode}"] rule`);

    const vars = new Map();
    for (const match of rule[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (!vars.has(match[1])) vars.set(match[1], match[2].trim());
    }

    const expectedAliases = {
      '--ui-bg-page': 'var(--background)',
      '--ui-bg-rail': 'var(--sidebar)',
      '--ui-bg-sidebar': 'var(--ui-bg-rail)',
      '--ui-bg-raised': 'var(--card)',
      '--ui-bg-surface': 'var(--card)',
      '--ui-bg-overlay': 'var(--popover)',
      '--ui-bg-bubble': 'var(--secondary)',
      '--ui-text-primary': 'var(--foreground)',
      '--ui-text-muted': 'var(--muted-foreground)',
      '--ui-accent-action': 'var(--primary)',
      '--ui-on-action': 'var(--primary-foreground)',
      '--ui-danger': 'var(--destructive)',
    };
    for (const [name, expected] of Object.entries(expectedAliases)) {
      assert.equal(vars.get(name), expected, `${mode} ${name} should alias ${expected}`);
    }
    assert.match(vars.get('--background') || '', /^oklch\(/, `${mode} background should use shadcn's OKLCH value`);
  }
});
