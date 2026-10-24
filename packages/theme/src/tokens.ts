/**
 * @socrates/theme — cross-client design tokens.
 *
 * Socrates Universal uses an original, cross-client neutral theme with product-owned
 * semantic roles. These tokens support the Universal App and shared packages.
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

/** Shared foundation metrics for Universal clients. */
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

/** Universal dark neutral palette, tuned for clear layered surfaces. */
export const darkPalette: ThemePalette = {
  mode: 'dark',
  accent: {
    strong: '0 0% 93.3%',
    soft: '0 0% 7.45%',
    surface: '0 0% 7.45%',
  },
  bg: {
    /* Four-step ladder: L1 3.14% → L2 5.1% → L3 7.45% → L4 9.41%.
     * Perceived-lightness steps are 1.96% / 2.35% / 1.96%, all inside the
     * 1.5%-3% band. The canvas is a near-black, never pure #000 — pure
     * black crushes shadow detail and lets the lowest layer read as a hole
     * punched through the UI. */
    page: '0 0% 3.14%',     // #080808  L1
    raised: '0 0% 7.45%',   // #131313  L3 — cards on the canvas
    overlay: '0 0% 9.41%',  // #181818  L4 — floating bars, menus
    hover: '0 0% 19.6%',    // #323232  selected/hover tint (off-ladder)
    sunken: '0 0% 3.14%',   // #080808  L1 — inset wells ride the canvas
  },
  text: {
    primary: '0 0% 95.29%',
    secondary: '0 0% 70.6%',
    tertiary: '0 0% 60.8%',
    muted: '0 0% 60.8%',
    disabled: '0 0% 60.8%',
  },
  border: {
    subtle: '0 0% 9.41%',
    default: '0 0% 12.5%',
    strong: '0 0% 17.6%',
  },
  danger: '1 78% 61%',
  success: '90 58% 49%',
  muted: '0 0% 60.8%',
  onAccent: '0 0% 3.14%',
};

export const lightPalette: ThemePalette = {
  mode: 'light',
  accent: {
    strong: '0 0% 6.67%',
    soft: '0 0% 94.12%',
    surface: '0 0% 94.12%',
  },
  bg: {
    /* Same four-step ladder, running the other way: L1 100% → L2 98.04%
     * → L3 96.47% → L4 94.12%. The canvas is L2 — the paper (L1) is what
     * raised and overlay surfaces are cut from, so they read as *lighter*
     * than the page they stand on instead of relying on a shadow alone.
     * The lower rungs spend themselves on recess and control. */
    page: '0 0% 98.04%',    // #fafafa  L2 — the canvas
    raised: '0 0% 100%',    // #ffffff  L1 — cards on the canvas
    overlay: '0 0% 100%',   // #ffffff  L1 — floating bars, menus
    hover: '0 0% 89.8%',    // #e5e5e5  selected/hover tint (off-ladder)
    sunken: '0 0% 94.12%',  // #f0f0f0  L4 — inset wells
  },
  text: {
    primary: '0 0% 6.67%',
    secondary: '0 0% 34.9%',
    tertiary: '0 0% 42%',
    muted: '0 0% 42%',
    disabled: '0 0% 56.1%',
  },
  border: {
    subtle: '0 0% 94.12%',
    default: '0 0% 89.8%',
    strong: '0 0% 83.1%',
  },
  danger: '10 88% 58%',
  success: '144 100% 31%',
  muted: '0 0% 42%',
  onAccent: '0 0% 100%',
};

export const palettes: Readonly<Record<ThemeMode, ThemePalette>> = {
  dark: darkPalette,
  light: lightPalette,
};

export function getThemePalette(mode: ThemeMode): ThemePalette {
  return palettes[mode];
}

/** Background color used for first paint by each theme mode. */
export function resolveBackground(mode: ThemeMode): string {
  return mode === 'light' ? '#fafafa' : '#080808';
}
