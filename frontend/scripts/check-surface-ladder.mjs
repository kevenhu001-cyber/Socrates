#!/usr/bin/env node
/*
 * Validate the frontend's shadcn palette contract.
 *
 * The former four-rung Geist ladder has been retired. The frontend now uses
 * shadcn's official Neutral semantic roles, with the official Stone scale as
 * its alternate theme. Legacy --ui-* and HSL aliases remain only as adapters
 * for surfaces that have not migrated to shadcn components yet.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const THEMES_CSS = join(FRONTEND, 'src/styles/themes.css');
const DISPLAY_PREFS = join(FRONTEND, 'src/displayPrefs.js');
const SHADCN_CSS = join(FRONTEND, 'src/styles/foundations/shadcn.css');
const COMPONENTS_JSON = join(FRONTEND, 'components.json');
const BASELINE = join(FRONTEND, 'scripts/surface-ladder.baseline.json');
const UPDATE = process.argv.includes('--update');

const PALETTES = { socrates: 'neutral', philosophy: 'stone' };
const NEUTRAL = {
  dark: {
    '--background': 'oklch(0.145 0 0)', '--foreground': 'oklch(0.985 0 0)',
    '--card': 'oklch(0.205 0 0)', '--popover': 'oklch(0.205 0 0)',
    '--primary': 'oklch(0.922 0 0)', '--primary-foreground': 'oklch(0.205 0 0)',
    '--secondary': 'oklch(0.269 0 0)', '--muted': 'oklch(0.269 0 0)',
    '--muted-foreground': 'oklch(0.708 0 0)', '--accent': 'oklch(0.269 0 0)',
    '--accent-foreground': 'oklch(0.985 0 0)', '--border': 'rgb(255 255 255 / 10%)',
    '--input': 'rgb(255 255 255 / 15%)', '--ring': 'oklch(0.556 0 0)',
    '--sidebar': 'oklch(0.205 0 0)', '--sidebar-foreground': 'oklch(0.985 0 0)',
    '--sidebar-primary': 'oklch(0.488 0.243 264.376)',
    '--sidebar-primary-foreground': 'oklch(0.985 0 0)',
    '--sidebar-accent': 'oklch(0.269 0 0)', '--sidebar-accent-foreground': 'oklch(0.985 0 0)',
    '--sidebar-border': 'rgb(255 255 255 / 10%)', '--sidebar-ring': 'oklch(0.556 0 0)',
  },
  light: {
    '--background': 'oklch(1 0 0)', '--foreground': 'oklch(0.145 0 0)',
    '--card': 'oklch(1 0 0)', '--popover': 'oklch(1 0 0)',
    '--primary': 'oklch(0.205 0 0)', '--primary-foreground': 'oklch(0.985 0 0)',
    '--secondary': 'oklch(0.97 0 0)', '--muted': 'oklch(0.97 0 0)',
    '--muted-foreground': 'oklch(0.556 0 0)', '--accent': 'oklch(0.97 0 0)',
    '--accent-foreground': 'oklch(0.205 0 0)', '--border': 'oklch(0.922 0 0)',
    '--input': 'oklch(0.922 0 0)', '--ring': 'oklch(0.708 0 0)',
    '--sidebar': 'oklch(0.985 0 0)', '--sidebar-foreground': 'oklch(0.145 0 0)',
    '--sidebar-primary': 'oklch(0.205 0 0)', '--sidebar-primary-foreground': 'oklch(0.985 0 0)',
    '--sidebar-accent': 'oklch(0.97 0 0)', '--sidebar-accent-foreground': 'oklch(0.205 0 0)',
    '--sidebar-border': 'oklch(0.922 0 0)', '--sidebar-ring': 'oklch(0.708 0 0)',
  },
};
const STONE = {
  dark: {
    '--background': '--color-stone-950', '--foreground': '--color-stone-50',
    '--card': '--color-stone-900', '--popover': '--color-stone-900',
    '--primary': '--color-stone-50', '--primary-foreground': '--color-stone-900',
    '--secondary': '--color-stone-800', '--muted': '--color-stone-800',
    '--muted-foreground': '--color-stone-400', '--accent': '--color-stone-800',
    '--accent-foreground': '--color-stone-50', '--ring': '--color-stone-500',
    '--sidebar': '--color-stone-900', '--sidebar-foreground': '--color-stone-50',
    '--sidebar-primary': '--color-stone-50', '--sidebar-primary-foreground': '--color-stone-900',
    '--sidebar-accent': '--color-stone-800', '--sidebar-accent-foreground': '--color-stone-50',
    '--sidebar-ring': '--color-stone-500',
  },
  light: {
    '--background': '--color-stone-50', '--foreground': '--color-stone-950',
    '--card': '--color-stone-50', '--popover': '--color-stone-50',
    '--primary': '--color-stone-900', '--primary-foreground': '--color-stone-50',
    '--secondary': '--color-stone-100', '--muted': '--color-stone-100',
    '--muted-foreground': '--color-stone-600', '--accent': '--color-stone-100',
    '--accent-foreground': '--color-stone-900', '--border': '--color-stone-200',
    '--input': '--color-stone-200', '--ring': '--color-stone-400',
    '--sidebar': '--color-stone-50', '--sidebar-foreground': '--color-stone-950',
    '--sidebar-primary': '--color-stone-900', '--sidebar-primary-foreground': '--color-stone-50',
    '--sidebar-accent': '--color-stone-100', '--sidebar-accent-foreground': '--color-stone-900',
    '--sidebar-border': '--color-stone-200', '--sidebar-ring': '--color-stone-400',
  },
};
const BRIDGE = [
  '--ui-bg-page', '--ui-bg-rail', '--ui-bg-panel', '--ui-bg-elevated',
  '--chat-page', '--chat-surface', '--chat-control', '--chat-control-hover',
  '--chat-line', '--chat-text', '--chat-muted', '--chat-overlay',
];
const LEGACY_CHANNELS = [
  '--bg-000', '--bg-100', '--bg-200', '--bg-300', '--text-000', '--text-100',
  '--text-200', '--text-300', '--text-400', '--text-500', '--border-100',
  '--border-200', '--border-300', '--border-400', '--border-500',
];

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp('(^|[}\\n])\\s*' + escaped + '\\s*\\{', 'm').exec(css);
  if (!match) return null;
  const start = css.indexOf('{', match.index);
  let depth = 0;
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}' && --depth === 0) return css.slice(start + 1, i);
  }
  return null;
}

function declarations(body) {
  const out = new Map();
  for (const match of (body || '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!out.has(match[1])) out.set(match[1], match[2].trim().replace(/\s+/g, ' '));
  }
  return out;
}

function themesFrom(css) {
  return [...new Set([...css.matchAll(/html\[data-theme="([^"]+)"\]/g)].map((match) => match[1]))].sort();
}

function runtimeThemes(source) {
  const match = /THEME_STYLES\s*=\s*\[([^\]]*)\]/.exec(source);
  return match ? match[1].split(',').map((part) => part.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort() : null;
}

function verifyRoles(actual, expected, label, failures) {
  for (const [name, value] of Object.entries(expected)) {
    if (actual.get(name) !== value) {
      failures.push(`${label}: ${name} must be ${value}, found ${actual.get(name) || '(missing)'}`);
    }
  }
}

function main() {
  const failures = [];
  const css = stripComments(readFileSync(THEMES_CSS, 'utf8'));
  const themeNames = themesFrom(css);
  const runtime = runtimeThemes(readFileSync(DISPLAY_PREFS, 'utf8'));
  if (!runtime) failures.push('displayPrefs.js: THEME_STYLES is missing');
  else if (JSON.stringify(themeNames) !== JSON.stringify(runtime)) {
    failures.push(`theme registry mismatch: CSS [${themeNames}] vs runtime [${runtime}]`);
  }

  if (themeNames.length !== Object.keys(PALETTES).length || themeNames.some((name) => !PALETTES[name])) {
    failures.push(`themes.css: expected the registered shadcn themes ${Object.keys(PALETTES).join(', ')}, found ${themeNames.join(', ')}`);
  }
  if (/--geist-[\w-]+\s*:/.test(css)) failures.push('themes.css: custom Geist color variables remain; use shadcn palette tokens');

  for (const mode of ['dark', 'light']) {
    const generic = declarations(ruleBody(css, `[data-mode="${mode}"]`));
    verifyRoles(generic, NEUTRAL[mode], `Neutral ${mode} palette`, failures);
    for (const role of BRIDGE) {
      if (!generic.has(role)) failures.push(`themes.css: [data-mode="${mode}"] is missing ${role} compatibility bridge`);
    }
    for (const channel of LEGACY_CHANNELS) {
      if (!generic.has(channel)) failures.push(`themes.css: [data-mode="${mode}"] is missing legacy channel ${channel}`);
    }

    const stone = declarations(ruleBody(css, `html[data-theme="philosophy"][data-mode="${mode}"]`));
    const stoneExpected = Object.fromEntries(Object.entries(STONE[mode]).map(([role, token]) => [role, `var(${token})`]));
    verifyRoles(stone, stoneExpected, `Stone ${mode} palette`, failures);
  }

  const config = JSON.parse(readFileSync(COMPONENTS_JSON, 'utf8'));
  if (config.tailwind?.baseColor !== 'neutral' || config.tailwind?.cssVariables !== true) {
    failures.push('components.json: shadcn baseColor must be neutral with CSS variables enabled');
  }
  const shadcnCss = readFileSync(SHADCN_CSS, 'utf8');
  if (!/--radius:\s*0\.625rem/.test(readFileSync(join(FRONTEND, 'src/styles/tokens.css'), 'utf8'))
      || !/--radius-lg:\s*var\(--radius\)/.test(shadcnCss)) {
    failures.push('shadcn Base Nova radius scale is not using the official 0.625rem base');
  }
  if (!/@layer\s+compatibility\s*,\s*theme\s*,\s*base\s*,\s*components\s*,\s*utilities/.test(shadcnCss)) {
    failures.push('foundations/shadcn.css: compatibility styles must precede Tailwind utilities in the layer order');
  }

  const expectedBaseline = {
    palettes: PALETTES,
    webOnly: true,
    generatedBy: 'check-surface-ladder.mjs --update',
  };
  if (UPDATE) {
    writeFileSync(BASELINE, `${JSON.stringify(expectedBaseline, null, 2)}\n`);
    console.log(`shadcn palette baseline updated: ${JSON.stringify(PALETTES)}`);
  } else if (!existsSync(BASELINE)) {
    failures.push('scripts/surface-ladder.baseline.json is missing; run with --update');
  } else {
    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
    if (JSON.stringify(baseline.palettes) !== JSON.stringify(PALETTES) || baseline.webOnly !== true) {
      failures.push('surface-ladder.baseline.json must record the Neutral/Stone web palette mapping');
    }
  }

  if (failures.length) {
    console.error('shadcn palette check FAILED:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('shadcn palette check passed (Neutral + Stone semantic scales and compatibility bridges).');
  }
}

if (process.argv[1] && process.argv[1].endsWith('check-surface-ladder.mjs')) main();
