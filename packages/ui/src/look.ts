/**
 * RN-8 — the marketing site's surface vocabulary for the learning and
 * conversation content (turn / learn / think / study / home).
 *
 * These are local constants on purpose: the shared tokens
 * (`packages/theme/src/ui.ts`) are being re-cut in RN-7, and this module
 * only reads the roles that already exist there. Every value is taken from
 * the site (`site/public.css`, `home-refresh.css`, `modules.css`); once the
 * tokens carry `subtle` / `surface` / the shadow ladder these helpers can
 * point at them and the components do not change.
 *
 * Sheets are told apart by a 1px hairline ring plus a soft lift, never by a
 * colour; nothing here draws a dot.
 */
import { uiShadow, type UiColors } from '@socrates/theme';

/** Site radius scale (`--radius-lg/xl/2xl/3xl`). */
export const R = {
  /** Option rows, inset sheets, code blocks (`--radius-lg`). */
  row: 12,
  /** Content cards: scaffolds, tool groups, mistakes (`--radius-xl`). */
  card: 16,
  /** Inner faces that sit inside a card (`.rc-face` 18). */
  face: 18,
  /** Stat cards and stages on a page (`--radius-2xl`). */
  sheet: 20,
  /** Stages, drawers, home starter cards (`--radius-3xl`). */
  stage: 24,
  pill: 999,
} as const;

/** Site space ladder (`--space-50 … 500`). */
export const S = {
  25: 2,
  50: 4,
  75: 8,
  100: 12,
  200: 16,
  300: 24,
  400: 32,
  500: 40,
} as const;

/** Control heights: site buttons 36 (`.rc-grade`), tags 24 (`.ui-tag`), card head 44 (`.demo-chat-head`). */
export const H = {
  action: 36,
  tag: 24,
  head: 44,
  option: 44,
  row: 40,
} as const;

/** Site motion: `--site-ease`, colour 150ms, move 200ms. */
export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function isCssVar(value: string): boolean {
  return value.startsWith('var(');
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * `pct` of `ink` over `card`: a tinted sheet that follows the theme.
 * Web hands CSS variables, so this resolves in the browser (`color-mix`);
 * native palettes are concrete hex and are blended here.
 */
export function tint(colors: UiColors, pct: number): string {
  if (isCssVar(colors.ink) || isCssVar(colors.card)) {
    return `color-mix(in srgb, ${colors.ink} ${pct}%, ${colors.card})`;
  }
  const a = hexToRgb(colors.ink);
  const b = hexToRgb(colors.card);
  if (!a || !b) return colors.fill;
  const mix = a.map((channel, index) => Math.round(channel * (pct / 100) + b[index]! * (1 - pct / 100)));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

export type Elevation = 'ring' | 'raised' | 'overlay' | 'dialog';

const DIALOG_LIGHT = '0 0 0 1px rgb(0 0 0 / 6%), 0 2px 4px rgb(0 0 0 / 4%), 0 24px 56px -20px rgb(0 0 0 / 18%)';

/**
 * Site elevation recipe: hairline ring + contact shadow + wide soft ambient.
 *   ring    `0 0 0 1px` hairline only
 *   raised  `--site-shadow-1` (cards)
 *   overlay `--site-shadow-2` (hovered cards, menus)
 *   dialog  `--site-shadow-3` (drawers, sheets)
 * Web reads the generated `--ui-elevation-*` variables so dark mode follows;
 * `dialog` has no variable yet and falls back to `overlay` in the dark.
 */
export function shadow(colors: UiColors, level: Elevation): string {
  if (isCssVar(colors.ink)) {
    if (level === 'dialog') return `var(--ui-elevation-dialog, var(--ui-elevation-overlay))`;
    return `var(--ui-elevation-${level})`;
  }
  const dark = colors.ink.toLowerCase() !== '#0d0d0d';
  const set = dark ? uiShadow.dark : uiShadow.light;
  if (level === 'dialog') return dark ? set.overlay : DIALOG_LIGHT;
  return set[level];
}

/** Inset hairline ring (`box-shadow: inset 0 0 0 1px …`), so a sheet's border never adds layout. */
export function insetRing(color: string, width = 1): string {
  return `inset 0 0 0 ${width}px ${color}`;
}

/**
 * The tinted sheets the site stacks: `subtle` (#f9f9f9, inner faces and
 * stages) and `surface` (#f3f3f3, a hovered row / a grey stage).
 */
export function sheets(colors: UiColors) {
  return {
    subtle: tint(colors, 2.5),
    surface: tint(colors, 5),
  };
}

/** Focus ring shared by every control here (site `:focus-visible`, 2px ink, offset 2). */
export function focusRing(colors: UiColors, focused: boolean, offset = 2): object {
  return {
    outlineStyle: focused ? 'solid' : undefined,
    outlineWidth: focused ? 2 : 0,
    outlineColor: colors.ink,
    outlineOffset: offset,
  };
}

/** Web-only CSS transition (RN Web passes it through; native ignores it). */
export function transition(props: string, reduced: boolean, ms = 150): object {
  return reduced ? {} : { transitionProperty: props, transitionDuration: `${ms}ms`, transitionTimingFunction: EASE };
}
