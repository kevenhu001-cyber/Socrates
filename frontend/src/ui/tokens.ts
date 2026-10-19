/**
 * Design tokens — shared Socrates semantic vocabulary.
 *
 * Socrates Design System v2 keeps the stable `--ui-*` / TypeScript API but
 * sources its neutral foundation from the Lobe UI v6 default token set.
 * Product-specific geometry and motion remain Socrates-owned.
 */

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

export interface AccentScale {
  readonly strong: string;
  readonly soft: string;
  readonly surface: string;
}

export interface ThemeBackgrounds {
  readonly page: string;
  readonly raised: string;
  readonly overlay: string;
  readonly hover: string;
  readonly sunken: string;
}

export interface ThemeText {
  readonly primary: string;
  readonly secondary: string;
  readonly tertiary: string;
  readonly muted: string;
  readonly disabled: string;
}

export interface ThemeBorder {
  readonly subtle: string;
  readonly default: string;
  readonly strong: string;
}

export interface ThemePalette {
  readonly mode: ThemeMode;
  readonly accent: AccentScale;
  readonly bg: ThemeBackgrounds;
  readonly text: ThemeText;
  readonly border: ThemeBorder;
  readonly danger: string;
  readonly success: string;
  readonly muted: string;
  readonly onAccent: string;
}

/**
 * Lobe UI v6 foundation metrics. Keep these values in lockstep with
 * `packages/theme/src/tokens.ts` and `styles/tokens.css`.
 *
 * These are intentionally separate from Socrates product tokens below:
 * product geometry may opt into a foundation rung, while touch targets,
 * composer geometry and optical adjustments remain free to diverge.
 */
export const foundationSpacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  base: 16,
  md: 20,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export type FoundationSpacingToken = keyof typeof foundationSpacing;

export const foundationRadius = {
  xs: 4,
  sm: 6,
  base: 8,
  lg: 12,
} as const;

export type FoundationRadiusToken = keyof typeof foundationRadius;

export const foundationControl = {
  sm: 28,
  base: 36,
  lg: 40,
  interactive: 18,
  outline: 2,
  paddingHorizontal: 12,
  paddingHorizontalSm: 8,
} as const;

export const foundationTypography = {
  fontSize: {
    sm: 12,
    base: 14,
    lg: 16,
    xl: 20,
    heading1: 38,
    heading2: 30,
    heading3: 24,
    heading4: 20,
    heading5: 16,
  },
  lineHeight: {
    sm: 1.6666666666666667,
    base: 1.5714285714285714,
    lg: 1.5,
    heading1: 1.2105263157894737,
    heading2: 1.2666666666666666,
    heading3: 1.3333333333333333,
    heading4: 1.4,
    heading5: 1.5,
  },
  weightStrong: 600,
} as const;

export const foundationMotion = {
  duration: {
    fast: 100,
    mid: 200,
    slow: 300,
  },
  easing: {
    inOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
    out: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
    outBack: 'cubic-bezier(0.12, 0.4, 0.29, 1.46)',
    outCirc: 'cubic-bezier(0.08, 0.82, 0.17, 1)',
    outQuint: 'cubic-bezier(0.23, 1, 0.32, 1)',
  },
} as const;

export const foundationBreakpoints = {
  xs: 480,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1600,
  xxxl: 1920,
} as const;

/* Socrates product spacing. `xxs` is an intentional 2px optical rung; the
 * remaining common rungs are a subset of the Lobe 4px foundation ladder. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export type SpacingToken = keyof typeof spacing;

/* Base radii align with Lobe; larger values are Socrates product geometry. */
export const radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  composer: 24,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;

export const fontSize = {
  xxs: '0.75rem',
  xs: '0.8125rem',
  sm: '0.875rem',
  md: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  xxl: '1.5rem',
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.7,
} as const;

export const breakpoints = {
  sm: 480,
  md: 768,
  lg: 1200,
} as const;

/**
 * Lobe default neutral palette projected into Socrates semantic roles.
 * Values stay as HSL triplets because legacy CSS consumers compose them with
 * `hsl(...)`; `themes.css` carries the exact upstream hex values.
 */
export const darkPalette: ThemePalette = {
  mode: 'dark',
  accent: {
    strong: '0 0% 93%',       // #eeeeee
    soft: '0 0% 7%',          // #111111
    surface: '0 0% 7%',       // #111111
  },
  bg: {
    page: '0 0% 0%',          // #000000  colorBgLayout
    raised: '0 0% 5%',        // #0d0d0d  colorBgContainer
    overlay: '0 0% 10%',      // #1a1a1a  colorBgElevated
    hover: '0 0% 13%',        // #202020  neutral hover step
    sunken: '0 0% 2%',        // #060606  containerSecondary
  },
  text: {
    primary: '0 0% 90%',      // #e6e6e6
    secondary: '0 0% 71%',    // #b4b4b4
    tertiary: '0 0% 56%',     // #8f8f8f
    muted: '0 0% 56%',        // description / idle icon role
    disabled: '0 0% 42%',     // #6b6b6b
  },
  border: {
    subtle: '0 0% 10%',       // #1a1a1a
    default: '0 0% 13%',      // #202020
    strong: '0 0% 18%',       // #2d2d2d
  },
  danger: '1 78% 61%',        // #e95350
  success: '90 58% 49%',      // #80c933
  muted: '0 0% 56%',
  onAccent: '0 0% 0%',
};

export const lightPalette: ThemePalette = {
  mode: 'light',
  accent: {
    strong: '0 0% 13%',       // #222222
    soft: '0 0% 96%',         // #f5f5f5
    surface: '0 0% 96%',      // #f5f5f5
  },
  bg: {
    page: '0 0% 97%',         // #f8f8f8  colorBgLayout
    raised: '0 0% 100%',      // #ffffff  colorBgContainer
    overlay: '0 0% 100%',     // #ffffff  colorBgElevated
    hover: '0 0% 93%',        // #eeeeee  neutral hover step
    sunken: '0 0% 98%',       // #fbfbfb  containerSecondary
  },
  text: {
    primary: '0 0% 12%',      // #1f1f1f
    secondary: '0 0% 40%',    // #666666
    tertiary: '0 0% 54%',     // #8a8a8a
    muted: '0 0% 54%',
    disabled: '0 0% 69%',     // #b0b0b0
  },
  border: {
    subtle: '0 0% 93%',       // #eeeeee
    default: '0 0% 89%',      // #e3e3e3
    strong: '0 0% 87%',       // #dddddd
  },
  danger: '10 88% 58%',       // #f35837
  success: '144 100% 31%',    // #00a03f
  muted: '0 0% 54%',
  onAccent: '0 0% 100%',
};

export const palettes: Readonly<Record<ThemeMode, ThemePalette>> = {
  dark: darkPalette,
  light: lightPalette,
};

export function getThemePalette(mode: ThemeMode): ThemePalette {
  return palettes[mode];
}

/**
 * First-frame page paint. These exact values mirror Lobe colorBgLayout and
 * `styles/themes.css`, preventing a flash before the stylesheet parses.
 */
export function resolveBackground(mode: ThemeMode): string {
  return mode === 'light' ? '#f8f8f8' : '#000000';
}
