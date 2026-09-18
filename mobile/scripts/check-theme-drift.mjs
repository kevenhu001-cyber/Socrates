import { readFileSync } from 'node:fs';

const repoRoot = new URL('../../', import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, repoRoot), 'utf8');

const css = read('frontend/src/styles.css');
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
      "soft: '0 0% 20%'",
      "surface: '0 0% 20%'",
      "page: '0 0% 13%'",
      "raised: '0 0% 16%'",
      "overlay: '0 0% 5%'",
      "hover: '0 0% 21%'",
      "sunken: '0 0% 2%'",
      "primary: '0 0% 100%'",
      "secondary: '0 0% 80%'",
      "tertiary: '0 0% 65%'",
      "muted: '0 0% 55%'",
      "default: '0 0% 22%'",
      "danger: '0 60% 55%'",
      "success: '142 60% 50%'",
      "onAccent: '0 0% 8%'",
    ],
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
      "strong: '0 0% 10%'",
      "soft: '0 0% 90%'",
      "surface: '0 0% 90%'",
      "page: '0 0% 98%'",
      "raised: '0 0% 95%'",
      "overlay: '0 0% 100%'",
      "hover: '0 0% 91%'",
      "sunken: '0 0% 100%'",
      "primary: '0 0% 13%'",
      "secondary: '0 0% 27%'",
      "tertiary: '0 0% 44%'",
      "muted: '0 0% 52%'",
      "default: '0 0% 76%'",
      "danger: '0 60% 45%'",
      "success: '142 50% 35%'",
      "onAccent: '0 0% 100%'",
    ],
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
  const themeFields = {
    accent: {
      strong: values.vars['accent-000'],
      soft: values.vars['accent-900'],
      surface: values.vars['accent-900'],
    },
    bg: {
      page: values.vars['bg-100'],
      raised: values.vars['bg-200'],
      overlay: values.vars['bg-000'],
      hover: values.vars['bg-300'],
      sunken: values.vars['bg-400'],
    },
    text: {
      primary: values.vars['text-100'],
      secondary: values.vars['text-200'],
      tertiary: values.vars['text-400'],
      muted: values.vars['text-500'],
      disabled: values.vars['text-500'],
    },
    border: {
      subtle: mode === 'dark' ? values.vars['border-300'] : '0 0% 90%',
      default: values.vars['border-300'],
      strong: mode === 'dark' ? values.vars['border-300'] : '0 0% 70%',
    },
  };
  for (const [group, fields] of Object.entries(themeFields)) {
    for (const [name, value] of Object.entries(fields)) {
      const match = themeBlock.match(new RegExp('--ui-' + group + '-' + name + ':\\s*([^;]+);'));
      if (!match || match[1] !== value) {
        fail(
          mode + ' themes.css --ui-' + group + '-' + name + ' is ' + (match?.[1] ?? '<missing>') + ', expected ' + value,
        );
      }
    }
  }
  const semanticFields = {
    danger: mode === 'dark' ? '0 60% 55%' : '0 60% 45%',
    success: mode === 'dark' ? '142 60% 50%' : '142 50% 35%',
    muted: values.vars['text-500'],
  };
  for (const [name, value] of Object.entries(semanticFields)) {
    const match = themeBlock.match(new RegExp('--ui-' + name + ':\\s*([^;]+);'));
    if (!match || match[1] !== value) {
      fail(mode + ' themes.css --ui-' + name + ' is ' + (match?.[1] ?? '<missing>') + ', expected ' + value);
    }
  }
  const onAccent = themeBlock.match(/--ui-on-accent:\s*([^;]+);/);
  if (!onAccent || onAccent[1] !== values.vars['oncolor-100']) {
    fail(mode + ' themes.css --ui-on-accent is ' + (onAccent?.[1] ?? '<missing>') + ', expected ' + values.vars['oncolor-100']);
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
  "LIGHT_PAGE_BACKGROUND = '#fafafa'",
  "DEFAULT_LIGHT_PICKER = '#fafafa'",
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
