/**
 * @socrates/theme — design tokens.
 *
 * These values are ported verbatim from `frontend/src/ui/tokens.ts`
 * (which is itself mirrored into `frontend/src/styles/tokens.css` for
 * CSS consumers). They are the single source of truth across the
 * Socrates client surface.
 *
 * Phase 0 of the reverse-align plan (see
 * `mobile/docs/frontend-parity.md`) creates this package so mobile
 * consumes the same vocabulary instead of inventing a parallel
 * dark-only ChatGPT-style palette.
 *
 * Conventions (inherited from `frontend/src/ui/tokens.ts`):
 *  - All color tokens are HSL triplets (`H S% L%`) so theme files
 *    compose them with `hsl(...)` directly.
 *  - Spacing follows a 4 px scale (`xxs`, `xs`, `sm`, `md`, `lg`,
 *    `xl`, `xxl`).
 *  - Breakpoints match the project's existing media-query ladders
 *    (≤480 px, ≤768 px, ≥1200 px).
 *  - Accent is a single gold/amber hue across light + dark — do not
 *    introduce the per-mode action blue that mobile currently uses.
 */

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

/* Accent lightness ladder — one row per role (foreground / soft
   background / surface). Components only need to know the role,
   not the lightness, so the ladder is grouped here. */
export interface AccentScale {
  /** Strong accent for primary buttons, active borders, link text. */
  readonly strong: string;
  /** Softer accent for chips, soft borders, hint text. */
  readonly soft: string;
  /** Background tint behind accent surfaces (e.g. tooltip body). */
  readonly surface: string;
}

export interface ThemeBackgrounds {
  /** Page-level background. */
  readonly page: string;
  /** Slightly raised surface (sidebar, chat column, modal body). */
  readonly raised: string;
  /** Even more raised (cards, popovers, dropdowns). */
  readonly overlay: string;
  /** Hover-state wash. */
  readonly hover: string;
  /** Edge of the canvas / decorative backgrounds. */
  readonly sunken: string;
}

export interface ThemeText {
  /** High-contrast body text. */
  readonly primary: string;
  /** Secondary text (descriptions, helper labels). */
  readonly secondary: string;
  /** Muted captions. */
  readonly tertiary: string;
  /** Hint placeholders. */
  readonly muted: string;
  /** Disabled / unreachable. */
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

/** Spacing scale — 4 px base. */
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

/** Radii — keep the ladder narrow so all surfaces round together. */
export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;

/** Font sizes — rem-equivalent pixel ramps for native typography. */
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

/** Breakpoints — must match the legacy @media queries in styles.css. */
export const breakpoints = {
  sm: 480,
  md: 768,
  lg: 1200,
} as const;

export type BreakpointToken = keyof typeof breakpoints;

/** Default easing curves — reused across transitions. */
export const easing = {
  /** Standard `cubic-bezier(0.16, 1, 0.3, 1)` — exit/enter ramps. */
  out: [0.16, 1, 0.3, 1] as const,
  /** `cubic-bezier(0.34, 1.3, 0.64, 1)` — popovers, modals. */
  spring: [0.34, 1.3, 0.64, 1] as const,
};

/** Standard border alpha so component code can blend `--ui-border-*`
 *  with a single, consistent opacity. */
export const borderAlpha = 0.25;

export const darkPalette: ThemePalette = {
  mode: 'dark',
  accent: {
    strong: '43 77% 62%',
    soft: '43 40% 20%',
    surface: '43 40% 20%',
  },
  bg: {
    page: '#101318',
    raised: '0 0% 13%',
    overlay: '0 0% 16%',
    hover: '0 0% 21%',
    sunken: '0 0% 5%',
  },
  text: {
    primary: '0 0% 100%',
    secondary: '0 0% 80%',
    tertiary: '0 0% 65%',
    muted: '0 0% 55%',
    disabled: '0 0% 45%',
  },
  border: {
    subtle: '0 0% 22%',
    default: '0 0% 22%',
    strong: '0 0% 32%',
  },
  danger: '0 60% 55%',
  success: '142 60% 50%',
  muted: '0 0% 50%',
  onAccent: '0 0% 100%',
};

export const lightPalette: ThemePalette = {
  mode: 'light',
  accent: {
    strong: '43 65% 42%',
    soft: '43 40% 90%',
    surface: '43 40% 90%',
  },
  bg: {
    page: '#e6dec8',
    raised: '40 25% 96%',
    overlay: '38 20% 92%',
    hover: '36 15% 87%',
    sunken: '42 33% 98%',
  },
  text: {
    primary: '36 12% 10%',
    secondary: '34 8% 28%',
    tertiary: '34 7% 35%',
    muted: '34 6% 43%',
    disabled: '34 5% 50%',
  },
  border: {
    subtle: '38 12% 86%',
    default: '36 10% 78%',
    strong: '36 9% 72%',
  },
  danger: '0 60% 45%',
  success: '142 50% 35%',
  muted: '34 5% 50%',
  onAccent: '0 0% 100%',
};

export const palettes: Readonly<Record<ThemeMode, ThemePalette>> = {
  dark: darkPalette,
  light: lightPalette,
};

export function getThemePalette(mode: ThemeMode): ThemePalette {
  return palettes[mode];
}

/** Page background the early paint hook should use before the bundle
 *  loads. Values must stay in sync with `darkPalette.bg.page` /
 *  `lightPalette.bg.page`. */
export function resolveBackground(mode: ThemeMode): string {
  return mode === 'light' ? lightPalette.bg.page : darkPalette.bg.page;
}
