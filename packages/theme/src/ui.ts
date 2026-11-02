/**
 * New UI tokens — the white / grey minimal system shared by `packages/ui`
 * React Native primitives and, through the generated stylesheet, by the web
 * shell (`frontend/src/styles/foundations/tokens.generated.css`).
 *
 * Direction (RN-1): white canvas, pale grey fills, hairline borders, pill
 * buttons, rounded cards, Geist + Noto Sans SC, black as the only accent.
 * No colour accents, no dotted or stippled decoration.
 *
 * This file is the single source: `scripts/gen-ui-tokens.mjs` reads the
 * exported objects below and writes CSS custom properties. Never hand-edit
 * the generated CSS; change the values here and re-run the generator.
 *
 * RN-7: the light canvas is pure white (the paper); cards and overlays are
 * separated from it by a 1px hairline plus a very soft shadow.
 *
 * The background ladder (page / rail / panel / elevated) is not redefined
 * here: canvas and card reuse the ladder rungs in `rn.ts` / `tokens.ts`, so
 * the surface-ladder guard keeps holding the web palette and the shared
 * package in step.
 */

import type { ThemeMode } from './tokens';

/** Colour roles the new primitives paint with. */
export interface UiColors {
  /** Page background (ladder `page`). */
  readonly canvas: string;
  /** Raised card surface (ladder: light `elevated`, dark `panel`). */
  readonly card: string;
  /** Pale grey fill for secondary buttons, pills and quiet cards. */
  readonly fill: string;
  readonly fillHover: string;
  readonly fillPressed: string;
  /** Hairline borders and dividers. */
  readonly hairline: string;
  readonly hairlineStrong: string;
  /** Text. `ink` is also the accent: black in light mode, near-white in dark. */
  readonly ink: string;
  readonly inkSecondary: string;
  readonly inkTertiary: string;
  readonly inkHover: string;
  /** Foreground on an `ink` fill (primary button label). */
  readonly onInk: string;
  /** RN-7 (site `--site-color-copy`): long-form body copy, one step under ink. */
  readonly copy: string;
  /** RN-7 (site `--site-color-subtle`): the quietest tinted sheet (rail, insight). */
  readonly subtle: string;
  /** RN-7 (site `--site-color-surface`): grey sheet behind white cards. */
  readonly surface: string;
  /** RN-7 (site ask-box focus ring): the deepened hairline of a focused field. */
  readonly hairlineFocus: string;
}

export const uiColors: Readonly<Record<ThemeMode, UiColors>> = {
  light: {
    canvas: '#ffffff',
    card: '#ffffff',
    fill: 'rgba(0, 0, 0, 0.04)',
    fillHover: 'rgba(0, 0, 0, 0.07)',
    fillPressed: 'rgba(0, 0, 0, 0.10)',
    hairline: 'rgba(0, 0, 0, 0.08)',
    hairlineStrong: 'rgba(0, 0, 0, 0.14)',
    ink: '#0d0d0d',
    inkSecondary: '#5d5d5d',
    inkTertiary: '#767676',
    inkHover: '#303030',
    onInk: '#ffffff',
    copy: '#303030',
    subtle: '#f9f9f9',
    surface: '#f3f3f3',
    hairlineFocus: 'rgba(0, 0, 0, 0.28)',
  },
  dark: {
    canvas: '#0a0a0a',
    card: '#1f1f1f',
    fill: 'rgba(255, 255, 255, 0.06)',
    fillHover: 'rgba(255, 255, 255, 0.10)',
    fillPressed: 'rgba(255, 255, 255, 0.14)',
    hairline: 'rgba(255, 255, 255, 0.10)',
    hairlineStrong: 'rgba(255, 255, 255, 0.16)',
    ink: '#ededed',
    inkSecondary: '#a1a1a1',
    inkTertiary: '#8f8f8f',
    inkHover: '#ffffff',
    onInk: '#0a0a0a',
    copy: '#d6d6d6',
    subtle: '#141414',
    surface: '#1a1a1a',
    hairlineFocus: 'rgba(255, 255, 255, 0.32)',
  },
};

/** Role → CSS custom property name in the generated stylesheet. */
export const uiColorVar: Readonly<Record<keyof UiColors, string>> = {
  canvas: '--ui-canvas',
  card: '--ui-card',
  fill: '--ui-fill',
  fillHover: '--ui-fill-hover',
  fillPressed: '--ui-fill-pressed',
  hairline: '--ui-hairline',
  hairlineStrong: '--ui-hairline-strong',
  ink: '--ui-ink',
  inkSecondary: '--ui-ink-secondary',
  inkTertiary: '--ui-ink-tertiary',
  inkHover: '--ui-ink-hover',
  onInk: '--ui-on-ink',
  copy: '--ui-copy',
  subtle: '--ui-subtle',
  surface: '--ui-surface',
  hairlineFocus: '--ui-hairline-focus',
};

/**
 * The same roles expressed as `var(--…)` references. React Native Web passes
 * CSS variables through untouched, so a web host can hand this palette to
 * the primitives and let the active `[data-mode]` decide the colour —
 * a theme switch repaints without re-rendering React.
 */
export const uiColorsCssVars: UiColors = Object.freeze(
  Object.fromEntries(
    (Object.keys(uiColorVar) as (keyof UiColors)[]).map((role) => [role, `var(${uiColorVar[role]})`]),
  ) as unknown as UiColors,
);

/** Font stacks. Geist for Latin, Noto Sans SC for Chinese. */
export const uiFont = {
  sans: '"Geist Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  mono: '"Geist Mono", ui-monospace, "Noto Sans SC", "SFMono-Regular", monospace',
} as const;

export interface UiTypeStep {
  readonly size: number;
  readonly lineHeight: number;
  readonly weight: '400' | '500' | '600';
  /** Letter spacing in px (negative tracking on display sizes). */
  readonly tracking: number;
}

/**
 * Type ladder. Display steps are larger and tighter than the previous app
 * scale: the hierarchy is carried by size and weight, never by colour.
 */
export const uiType = {
  display: { size: 52, lineHeight: 56, weight: '500', tracking: -1.82 },
  displayCompact: { size: 34, lineHeight: 40, weight: '500', tracking: -0.85 },
  /** Home greeting: kept at the app's restrained 28px (24px on phones). */
  greeting: { size: 28, lineHeight: 36, weight: '500', tracking: -0.42 },
  greetingCompact: { size: 24, lineHeight: 32, weight: '500', tracking: -0.36 },
  title: { size: 20, lineHeight: 28, weight: '500', tracking: -0.3 },
  titleSm: { size: 17, lineHeight: 24, weight: '500', tracking: -0.17 },
  body: { size: 16, lineHeight: 26, weight: '400', tracking: 0 },
  bodySm: { size: 14, lineHeight: 22, weight: '400', tracking: 0 },
  label: { size: 15, lineHeight: 22, weight: '500', tracking: 0 },
  labelSm: { size: 13, lineHeight: 18, weight: '500', tracking: 0 },
  eyebrow: { size: 12, lineHeight: 16, weight: '500', tracking: 0.6 },
} as const satisfies Record<string, UiTypeStep>;

export type UiTypeToken = keyof typeof uiType;

/**
 * Corner radii — the marketing site's 4 / 8 / 12 / 16 / 20 / 24 scale
 * (site public.css `--radius-*`). Controls are pills; list rows and inset
 * panels take 12; cards 16; the composer and large sheets 24.
 */
export const uiRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  card: 24,
  pill: 999,
} as const;

/** Spacing scale (4px base, wider top end for generous whitespace). */
export const uiSpace = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
  9: 96,
} as const;

export type UiSpaceToken = keyof typeof uiSpace;

/**
 * RN-7 — the site's named spacing ladder (public.css `--space-25 … 900`),
 * kept under its own names so chrome written against the site reads 1:1.
 */
export const uiStep = {
  25: 2,
  50: 4,
  75: 8,
  100: 12,
  200: 16,
  300: 24,
  400: 32,
  500: 40,
  600: 48,
  700: 64,
  800: 80,
  900: 96,
} as const;

/**
 * RN-7 — control geometry from the site (chrome.css / home-refresh.css):
 * nav pills and header buttons are 36px tall inside a 44px hit area, page
 * buttons 40px, the question box sits at 52px minimum with a 36px send disc
 * inset 8px. Horizontal padding: nav pill 12, button 16, chip 14.
 */
export const uiControl = {
  pill: 36,
  button: 40,
  hit: 44,
  row: 36,
  composerMin: 52,
  composerDisc: 36,
  padNav: 12,
  padButton: 16,
  padChip: 14,
} as const;

/**
 * Shadows — the site's elevation recipe (public.css `--site-shadow-1/2/3`,
 * home-refresh.css `.ask-box`): every lift is a 1px hairline ring plus a
 * contact shadow plus a wide, very soft ambient one. Never a colour.
 *   ring      hairline only (inputs, quiet cards)
 *   raised    shadow-1: cards, the white canvas sheet
 *   overlay   shadow-2: menus, popovers
 *   dialog    shadow-3: dialogs, drawers
 *   field / fieldHover / fieldFocus   the question box at rest / hover / focus
 */
export interface UiShadowSet {
  readonly ring: string;
  readonly raised: string;
  readonly overlay: string;
  readonly dialog: string;
  readonly field: string;
  readonly fieldHover: string;
  readonly fieldFocus: string;
}

export const uiShadow: Readonly<Record<ThemeMode, UiShadowSet>> = {
  light: {
    ring: '0 0 0 1px rgb(0 0 0 / 8%)',
    raised: '0 0 0 1px rgb(0 0 0 / 5%), 0 1px 2px rgb(0 0 0 / 4%), 0 4px 12px -4px rgb(0 0 0 / 5%)',
    overlay: '0 0 0 1px rgb(0 0 0 / 5%), 0 1px 2px rgb(0 0 0 / 4%), 0 12px 32px -12px rgb(0 0 0 / 12%)',
    dialog: '0 0 0 1px rgb(0 0 0 / 6%), 0 2px 4px rgb(0 0 0 / 4%), 0 24px 56px -20px rgb(0 0 0 / 18%)',
    field: '0 0 0 1px rgb(0 0 0 / 8%), 0 1px 2px rgb(0 0 0 / 4%), 0 12px 40px -12px rgb(0 0 0 / 14%)',
    fieldHover: '0 0 0 1px rgb(0 0 0 / 12%), 0 1px 2px rgb(0 0 0 / 5%), 0 16px 48px -14px rgb(0 0 0 / 16%)',
    fieldFocus: '0 0 0 1px rgb(0 0 0 / 28%), 0 0 0 4px rgb(0 0 0 / 5%), 0 16px 48px -14px rgb(0 0 0 / 16%)',
  },
  dark: {
    ring: '0 0 0 1px rgb(255 255 255 / 10%)',
    raised: '0 0 0 1px rgb(255 255 255 / 8%), 0 1px 2px rgb(0 0 0 / 40%)',
    overlay: '0 0 0 1px rgb(255 255 255 / 8%), 0 12px 32px -4px rgb(0 0 0 / 45%)',
    dialog: '0 0 0 1px rgb(255 255 255 / 10%), 0 24px 56px -20px rgb(0 0 0 / 60%)',
    field: '0 0 0 1px rgb(255 255 255 / 10%), 0 12px 40px -12px rgb(0 0 0 / 50%)',
    fieldHover: '0 0 0 1px rgb(255 255 255 / 16%), 0 16px 48px -14px rgb(0 0 0 / 55%)',
    fieldFocus: '0 0 0 1px rgb(255 255 255 / 32%), 0 0 0 4px rgb(255 255 255 / 6%), 0 16px 48px -14px rgb(0 0 0 / 55%)',
  },
};

/** Focus: the site's 2px ink outline, offset 2px on pills (chrome.css). */
export const uiFocus = { width: 2, offset: 2 } as const;

/**
 * Motion (site public.css): colour changes 150ms, small moves 200ms, slow
 * 400ms, entrances ~500ms; one ease. Press feedback is a 0.98 scale.
 * Everything collapses to 0 under reduced motion.
 */
export const uiMotion = {
  fast: 150,
  medium: 200,
  slow: 400,
  enter: 500,
  press: 0.98,
  easeOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;
