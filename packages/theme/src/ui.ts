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
}

export const uiColors: Readonly<Record<ThemeMode, UiColors>> = {
  light: {
    canvas: '#fafafa',
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
  title: { size: 20, lineHeight: 28, weight: '500', tracking: -0.3 },
  titleSm: { size: 17, lineHeight: 24, weight: '500', tracking: -0.17 },
  body: { size: 16, lineHeight: 26, weight: '400', tracking: 0 },
  bodySm: { size: 14, lineHeight: 22, weight: '400', tracking: 0 },
  label: { size: 15, lineHeight: 22, weight: '500', tracking: 0 },
  labelSm: { size: 13, lineHeight: 18, weight: '500', tracking: 0 },
  eyebrow: { size: 12, lineHeight: 16, weight: '500', tracking: 0.6 },
} as const satisfies Record<string, UiTypeStep>;

export type UiTypeToken = keyof typeof uiType;

/** Corner radii. Controls are pills; cards are generously rounded. */
export const uiRadius = {
  sm: 8,
  md: 12,
  lg: 16,
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

/** Shadows: a hairline ring plus a soft, low-contrast lift. */
export const uiShadow: Readonly<Record<ThemeMode, { readonly ring: string; readonly raised: string; readonly overlay: string }>> = {
  light: {
    ring: '0 0 0 1px rgb(0 0 0 / 8%)',
    raised: '0 0 0 1px rgb(0 0 0 / 5%), 0 1px 2px rgb(0 0 0 / 4%), 0 4px 12px -4px rgb(0 0 0 / 5%)',
    overlay: '0 0 0 1px rgb(0 0 0 / 5%), 0 1px 2px rgb(0 0 0 / 4%), 0 12px 32px -12px rgb(0 0 0 / 12%)',
  },
  dark: {
    ring: '0 0 0 1px rgb(255 255 255 / 10%)',
    raised: '0 0 0 1px rgb(255 255 255 / 8%), 0 1px 2px rgb(0 0 0 / 40%)',
    overlay: '0 0 0 1px rgb(255 255 255 / 8%), 0 12px 32px -4px rgb(0 0 0 / 45%)',
  },
};

/** Motion: short, purposeful. Used for press feedback and the entrance only. */
export const uiMotion = {
  fast: 150,
  medium: 220,
  enter: 420,
  easeOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;
