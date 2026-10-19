/**
 * @socrates/theme — cross-client design tokens.
 *
 * Socrates Design System v2 uses the Lobe UI v6 default neutral palette and
 * foundation metrics while preserving Socrates-owned product geometry. This
 * file mirrors `frontend/src/ui/tokens.ts` for the Universal App and packages.
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

/** Lobe UI v6 foundation metrics shared by Web and native clients. */
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

/** Existing Socrates product spacing; retained for compatibility. */
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

/** Legacy shared product radii; use `foundationRadius` for foundation work. */
export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;

export const fontSize = {
  xxs: 12,
  xs: 13,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
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

export type BreakpointToken = keyof typeof breakpoints;

export const easing = {
  out: [0.16, 1, 0.3, 1] as const,
  spring: [0.34, 1.3, 0.64, 1] as const,
};

export const borderAlpha = 0.25;

/** Lobe default neutral palette projected into Socrates semantic roles. */
export const darkPalette: ThemePalette = {
  mode: 'dark',
  accent: {
    strong: '0 0% 93%',
    soft: '0 0% 7%',
    surface: '0 0% 7%',
  },
  bg: {
    page: '0 0% 0%',
    raised: '0 0% 5%',
    overlay: '0 0% 10%',
    hover: '0 0% 13%',
    sunken: '0 0% 2%',
  },
  text: {
    primary: '0 0% 90%',
    secondary: '0 0% 71%',
    tertiary: '0 0% 56%',
    muted: '0 0% 56%',
    disabled: '0 0% 42%',
  },
  border: {
    subtle: '0 0% 10%',
    default: '0 0% 13%',
    strong: '0 0% 18%',
  },
  danger: '1 78% 61%',
  success: '90 58% 49%',
  muted: '0 0% 56%',
  onAccent: '0 0% 0%',
};

export const lightPalette: ThemePalette = {
  mode: 'light',
  accent: {
    strong: '0 0% 13%',
    soft: '0 0% 96%',
    surface: '0 0% 96%',
  },
  bg: {
    page: '0 0% 97%',
    raised: '0 0% 100%',
    overlay: '0 0% 100%',
    hover: '0 0% 93%',
    sunken: '0 0% 98%',
  },
  text: {
    primary: '0 0% 12%',
    secondary: '0 0% 40%',
    tertiary: '0 0% 54%',
    muted: '0 0% 54%',
    disabled: '0 0% 69%',
  },
  border: {
    subtle: '0 0% 93%',
    default: '0 0% 89%',
    strong: '0 0% 87%',
  },
  danger: '10 88% 58%',
  success: '144 100% 31%',
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

/** Lobe default colorBgLayout values used for pre-paint. */
export function resolveBackground(mode: ThemeMode): string {
  return mode === 'light' ? '#f8f8f8' : '#000000';
}
