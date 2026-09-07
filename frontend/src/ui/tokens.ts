/**
 * Design tokens — single source of truth for color, spacing, typography,
 * and breakpoint values across the UI.
 *
 * Tokens are published as CSS custom properties in
 * `src/styles/tokens.css` (the `--ui-*` namespace) and consumed by
 * component CSS, theme files, and JS code that needs to derive a
 * runtime value (e.g. `resolveBackground()` paints the document
 * background before the bundle finishes parsing so the first frame
 * never shows the Capacitor WebView default white flash).
 *
 * Conventions
 *  - All color tokens are HSL strings (`H S% L%`) so theme files
 *    compose them with `hsl(...)` directly. Hex values are reserved
 *    for `resolveBackground()` (one-shot pre-paint before CSS is
 *    available) and the legacy `displayPrefs` swatches.
 *  - Spacing follows a 4 px scale (`xxs`, `xs`, `sm`, `md`, `lg`,
 *    `xl`, `xxl`). Components should prefer the token over a literal
 *    pixel value to keep the rhythm consistent.
 *  - Breakpoints match the project's existing media-query ladders
 *    (≤480 px, ≤768 px, ≥1200 px).
 *  - Accent lightness steps mirror the legacy HSL palette so the
 *    `setAccentColor()` hue picker keeps working — see
 *    `displayPrefs.js` for the corresponding inline overrides.
 *
 * Theme resolution
 *  - `themeMode` describes the *effective* mode (light/dark) that
 *    drives styling. `themePreference` is the user's choice between
 *    light/dark/system; resolution of system → mode lives in
 *    `displayPrefs.js` to keep the boot path free of dynamic
 *    imports.
 *  - `resolveBackground(mode)` returns the paint color used by the
 *    early Capacitor-paint hook in `index.html`. The values mirror
 *    the page background the bundled CSS produces once it loads, so
 *    there is no visible flash between the pre-paint and the
 *    stylesheet taking effect.
 */

/** Theme mode that drives styling. `system` is resolved into
 *  `light` or `dark` before any token is read at runtime. */
export type ThemeMode = 'light' | 'dark';

/** User preference as stored in localStorage. `system` means
 *  follow the OS-level prefers-color-scheme media query. */
export type ThemePreference = ThemeMode | 'system';

/* Accent lightness ladder — one row per role (foreground / soft
   background / dark surface). Components only need to know the role,
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
  /** Page-level background; what `resolveBackground(mode)` returns. */
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

/* Spacing scale — 4 px base, doubled up to xxl. Components use these
   instead of pixel literals so a future redesign can re-tune the
   rhythm from this one file. */
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

/* Radii — keep the ladder narrow so all surfaces round together. */
export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;

/* Typography — sizes/weights/line heights. Components reference these
   tokens through CSS custom properties (`--ui-font-size-*` etc.) so
   theming and accessibility remixes can override the values without
   touching JS. */
export const fontSize = {
  xxs: '0.75rem', // 12 px
  xs:  '0.8125rem', // 13 px
  sm:  '0.875rem', // 14 px
  md:  '1rem',    // 16 px
  lg:  '1.125rem', // 18 px
  xl:  '1.25rem',  // 20 px
  xxl: '1.5rem',   // 24 px
} as const;

export const fontWeight = {
  regular: 400,
  medium:  500,
  semibold: 600,
  bold: 700,
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.7,
} as const;

/* Breakpoints — must match the legacy @media queries in styles.css.
   Keep the values centralized so future responsive audits don't have to
   grep the file. */
export const breakpoints = {
  sm: 480,
  md: 768,
  lg: 1200,
} as const;

/* Theme palettes — colors only. Spacing/typography/radii are mode-
   independent. Each palette is consumed by `themes.css` to author
   the `[data-mode=dark|light]` selectors; the JS side reads
   `resolveBackground()` for pre-paint and `getThemePalette(mode)`
   for runtime-derived colors. */
export const darkPalette: ThemePalette = {
  mode: 'dark',
  accent: {
    strong: '43 77% 62%',
    soft: '43 40% 20%',
    surface: '43 40% 20%',
  },
  bg: {
    page: '#000000',
    raised: '0 0% 13%',
    overlay: '0 0% 16%',
    hover: '0 0% 21%',
    sunken: '0 0% 0%',
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
    page: '#ffffff',
    raised: '0 0% 98%',
    overlay: '0 0% 95%',
    hover: '0 0% 91%',
    sunken: '0 0% 100%',
  },
  text: {
    primary: '0 0% 8%',
    secondary: '0 0% 27%',
    tertiary: '0 0% 36%',
    muted: '0 0% 44%',
    disabled: '0 0% 52%',
  },
  border: {
    subtle: '0 0% 90%',
    default: '0 0% 84%',
    strong: '0 0% 76%',
  },
  danger: '0 60% 45%',
  success: '142 50% 35%',
  muted: '0 0% 50%',
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
 * Returns the page background to paint on `document.documentElement`
 * before the bundle CSS finishes parsing. The Capacitor WebView boot
 * hook in `index.html` calls this synchronously so the first frame
 * already matches the effective theme and no white flash shows.
 *
 * The hex values mirror the page background the bundled CSS produces
 * once it loads (see `themes.css`). Keep the two in sync if either
 * drifts.
 */
export function resolveBackground(mode: ThemeMode): string {
  return mode === 'light' ? lightPalette.bg.page : darkPalette.bg.page;
}
