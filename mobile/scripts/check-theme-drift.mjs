import { readFileSync } from 'node:fs';

const repoRoot = new URL('../../', import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, repoRoot), 'utf8');

const css = read('frontend/src/styles/legacy/00-foundations.css');
const webJsTokens = read('frontend/src/ui/tokens.js');
const webCssTokens = read('frontend/src/styles/tokens.css');
const frontendTokens = read('frontend/src/ui/tokens.ts');
const packageTokens = read('packages/theme/src/tokens.ts');
const rnTokens = read('packages/theme/src/rn.ts');
const mobileTheme = read('mobile/src/theme/theme.ts');
const themeCss = read('frontend/src/styles/themes.css');

const expected = {
  dark: {
    vars: {
      'bg-000': '0 0% 5%',
      'bg-100': '0 0% 13%',
      'bg-200': '0 0% 16%',
      'bg-300': '0 0% 21%',
      'bg-400': '0 0% 2%',
      'text-100': '0 0% 100%',
      'text-200': '0 0% 80%',
      'text-400': '0 0% 65%',
      'text-500': '0 0% 55%',
      'border-300': '0 0% 22%',
      'accent-000': '0 0% 100%',
      'accent-900': '0 0% 20%',
      'oncolor-100': '0 0% 8%',
    },
    package: [
      "strong: '0 0% 100%'",
      "soft: '0 0% 19%'",
      "surface: '0 0% 19%'",
      "page: '0 0% 0%'",
      "raised: '0 0% 13%'",
      "overlay: '0 0% 19%'",
      "hover: '0 0% 19%'",
      "sunken: '0 0% 0%'",
      "primary: '0 0% 100%'",
      "secondary: '0 0% 80%'",
      "tertiary: '0 0% 69%'",
      "muted: '0 0% 61%'",
      "default: '0 0% 19%'",
      "danger: '1 100% 70%'",
      "success: '169 71% 56%'",
      "onAccent: '0 0% 0%'",
    ],
    /* The rendered surface tokens in frontend/src/styles/themes.css — measured
     * chatgpt.com values (hex), decoupled from the legacy HSL vars above. */
    ui: {
      'bg-page': '#000000',
      'bg-sidebar': '#000000',
      'bg-raised': '#171717',
      'bg-surface': '#212121',
      'bg-control': '#303030',
      'bg-hover': '#303030',
      'bg-overlay': '#303030',
      'text-primary': '#ffffff',
      'text-secondary': '#cdcdcd',
      'text-tertiary': '#afafaf',
      'text-muted': '#9b9b9b',
      'text-disabled': '#6b6b6b',
      'border-subtle': 'rgb(255 255 255 / 10%)',
      'border-default': 'rgb(255 255 255 / 15%)',
      'border-strong': 'rgb(255 255 255 / 20%)',
      'accent-strong': '#ffffff',
      'danger': '#ff6764',
      'success': '#42dec2',
      'on-accent': '#000',
      'link': 'rgb(129 166 249)',
    },
  },
  light: {
    vars: {
      'bg-000': '0 0% 100%',
      'bg-100': '0 0% 98%',
      'bg-200': '0 0% 95%',
      'bg-300': '0 0% 91%',
      'bg-400': '0 0% 100%',
      'text-100': '0 0% 13%',
      'text-200': '0 0% 27%',
      'text-400': '0 0% 44%',
      'text-500': '0 0% 52%',
      'border-300': '0 0% 76%',
      'accent-000': '0 0% 10%',
      'accent-900': '0 0% 90%',
      'oncolor-100': '0 0% 100%',
    },
    package: [
      "strong: '0 0% 5%'",
      "soft: '0 0% 91%'",
      "surface: '0 0% 91%'",
      "page: '0 0% 100%'",
      "raised: '0 0% 98%'",
      "overlay: '0 0% 100%'",
      "hover: '0 0% 95%'",
      "sunken: '0 0% 100%'",
      "primary: '0 0% 5%'",
      "secondary: '0 0% 36%'",
      "tertiary: '0 0% 43%'",
      "muted: '0 0% 45%'",
      "default: '0 0% 90%'",
      "danger: '3 79% 47%'",
      "success: '171 97% 25%'",
      "onAccent: '0 0% 100%'",
    ],
    ui: {
      'bg-page': '#ffffff',
      'bg-sidebar': '#fcfcfc',
      'bg-raised': '#f9f9f9',
      'bg-surface': '#f3f3f3',
      'bg-control': '#e8e8e8',
      'bg-hover': '#f3f3f3',
      'bg-overlay': '#ffffff',
      'text-primary': '#0d0d0d',
      'text-secondary': '#5d5d5d',
      'text-tertiary': '#6e6e6e',
      'text-muted': '#737373',
      'text-disabled': '#b4b4b4',
      'border-subtle': 'rgb(0 0 0 / 6%)',
      'border-default': 'rgb(0 0 0 / 10%)',
      'border-strong': 'rgb(0 0 0 / 20%)',
      'accent-strong': '#0d0d0d',
      'danger': '#d8241a',
      'success': '#027c6a',
      'on-accent': '#fff',
      'link': 'rgb(36 81 218)',
    },
  },
};

function fail(message) {
  throw new Error(`Theme drift: ${message}`);
}

function cssVariables(mode) {
  const match = css.match(new RegExp(`\\[data-theme=socrates\\]\\[data-mode=${mode}\\]\\{([^}]*)\\}`));
  if (!match) fail(`missing ${mode} CSS palette block`);
  return Object.fromEntries(
    [...match[1].matchAll(/--([\w-]+):([^;]+);?/g)].map(([, name, value]) => [name, value]),
  );
}

for (const [mode, values] of Object.entries(expected)) {
  const vars = cssVariables(mode);
  for (const [name, value] of Object.entries(values.vars)) {
    if (vars[name] !== value) fail(`${mode} CSS --${name} is ${vars[name] ?? '<missing>'}, expected ${value}`);
  }

  const paletteBlock = packageTokens.match(
    new RegExp(`export const ${mode}Palette: ThemePalette = \\{([\\s\\S]*?)\\n\\};`),
  )?.[1];
  if (!paletteBlock) fail(`missing ${mode} package palette`);
  for (const field of values.package) {
    if (!paletteBlock.includes(field)) fail(`${mode} package palette is missing ${field}`);
  }

  const frontendPaletteBlock = frontendTokens.match(
    new RegExp(`export const ${mode}Palette: ThemePalette = \\{([\\s\\S]*?)\\n\\};`),
  )?.[1];
  if (!frontendPaletteBlock) fail(`missing ${mode} frontend token palette`);
  for (const field of values.package) {
    if (!frontendPaletteBlock.includes(field)) fail(`${mode} frontend token palette is missing ${field}`);
  }
  const themeBlock = themeCss.match(
    new RegExp('\\[data-mode="' + mode + '"\\] \\{([\\s\\S]*?)\\n\\}'),
  )?.[1];
  if (!themeBlock) fail('missing ' + mode + ' themes.css palette');
  // themes.css --ui-* are the rendered surface tokens — measured chatgpt.com
  // hex/rgb literals since 7a502099, no longer derived from the legacy
  // HSL vars. Pin them directly per mode.
  for (const [name, value] of Object.entries(values.ui)) {
    const match = themeBlock.match(new RegExp('--ui-' + name + ':\\s*([^;]+);'));
    if (!match || match[1].trim() !== value) {
      fail(mode + ' themes.css --ui-' + name + ' is ' + (match?.[1]?.trim() ?? '<missing>') + ', expected ' + value);
    }
  }
}

for (const expectedText of [
  "onAccent: '#141414'",
  "default: '#c2c2c2'",
  "strong: '#b3b3b3'",
]) {
  if (!rnTokens.includes(expectedText)) fail(`RN hex table is missing ${expectedText}`);
}

for (const expectedText of [
  "LIGHT_PAGE_BACKGROUND = '#ffffff'",
  "DEFAULT_LIGHT_PICKER = '#ffffff'",
]) {
  if (!webJsTokens.includes(expectedText)) fail('web JS token adapter is missing ' + expectedText);
}
if (!webCssTokens.includes('--ui-radius-xl: 16px')) fail('web CSS token declarations are missing --ui-radius-xl');

for (const expectedFont of [
  'Plus Jakarta Sans',
  'Noto Sans SC',
  'Newsreader',
  'JetBrains Mono',
]) {
  if (!mobileTheme.includes(expectedFont)) fail(`mobile typography is missing ${expectedFont}`);
}

console.log('Theme drift check passed: web CSS, shared tokens, RN hex table, and mobile typography agree.');
