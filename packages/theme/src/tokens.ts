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
 *  - Accent is a fixed monochrome ramp (white-on-black in dark mode,
 *    black-on-white in light mode). The app no longer ships a
 *    selectable theme colour.
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
  /** Dialogs and cards in the web workspace use a 16px outer radius. */
  xl: 16,
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

/**
 * Values are ported verbatim from `frontend/src/ui/tokens.ts`, which was
 * retuned to chatgpt.com's measured neutral scale (docs/ref/chatgpt-parity.md).
 * `rn.ts` keeps a separate hand-mapped hex table for the phone canvas.
 */
export const darkPalette: ThemePalette = {
  mode: 'dark',
  accent: {
    strong: '0 0% 94%',
    soft: '0 0% 18%',
    surface: '0 0% 18%',
  },
  bg: {
    page: '0 0% 8%',
    raised: '0 0% 11%',
    overlay: '0 0% 16%',
    hover: '0 0% 17%',
    sunken: '0 0% 5%',
  },
  text: {
    primary: '0 0% 91%',
    secondary: '0 0% 76%',
    tertiary: '0 0% 61%',
    muted: '0 0% 50%',
    disabled: '0 0% 38%',
  },
  border: {
    subtle: '0 0% 15%',
    default: '0 0% 19%',
    strong: '0 0% 25%',
  },
  danger: '1 100% 70%',
  success: '169 71% 56%',
  muted: '0 0% 50%',
  onAccent: '0 0% 0%',
};

export const lightPalette: ThemePalette = {
  mode: 'light',
  accent: {
    strong: '0 0% 5%',
    soft: '0 0% 91%',
    surface: '0 0% 91%',
  },
  bg: {
    page: '0 0% 100%',
    raised: '0 0% 98%',
    overlay: '0 0% 100%',
    hover: '0 0% 95%',
    sunken: '0 0% 100%',
  },
  text: {
    primary: '0 0% 5%',
    secondary: '0 0% 36%',
    tertiary: '0 0% 43%',
    muted: '0 0% 45%',
    disabled: '0 0% 71%',
  },
  border: {
    subtle: '0 0% 94%',
    default: '0 0% 90%',
    strong: '0 0% 80%',
  },
  danger: '3 79% 47%',
  success: '171 97% 25%',
  muted: '0 0% 45%',
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
  /* Hex literals, not the HSL triplets above — this value is painted
   * before any stylesheet parses, so it must be a self-contained color.
   * Keep in sync with `bg.page` in both palettes. */
  return mode === 'light' ? '#fafafa' : '#212121';
}
