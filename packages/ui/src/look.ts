/**
 * RN-8 / RN-9 — the marketing site's surface vocabulary for the learning
 * and conversation content (turn / learn / think / study / home).
 *
 * Every value here now reads the RN-7 tokens in `@socrates/theme`
 * (`packages/theme/src/ui.ts`): the `subtle` / `surface` colour roles, the
 * shadow ladder including `dialog`, the radius scale, the site space
 * ladder (`uiStep`) and control geometry (`uiControl`). The short names
 * (R / S / H) stay so the components do not change.
 *
 * Sheets are told apart by a 1px hairline ring plus a soft lift, never by a
 * colour; nothing here draws a dot.
 */
import { uiColors, uiControl, uiFocus, uiMotion, uiRadius, uiShadow, uiStep, type UiColors } from '@socrates/theme';

/** Site radius scale (`uiRadius`, site `--radius-lg/xl/2xl/3xl`). */
export const R = {
  /** Option rows, inset sheets, code blocks (`--radius-lg`). */
  row: uiRadius.md,
  /** Content cards: scaffolds, tool groups, mistakes (`--radius-xl`). */
  card: uiRadius.lg,
  /**
   * Inner faces that sit inside a card (site `.rc-face` 18). The site uses
   * this one off-scale value and the token scale has no 18 rung.
   */
  face: 18,
  /** Stat cards and stages on a page (`--radius-2xl`). */
  sheet: uiRadius.xl,
  /** Stages, drawers, home starter cards (`--radius-3xl`). */
  stage: uiRadius.card,
  pill: uiRadius.pill,
} as const;

/** Site space ladder (`uiStep`, site `--space-25 … 500`). */
export const S = {
  25: uiStep[25],
  50: uiStep[50],
  75: uiStep[75],
  100: uiStep[100],
  200: uiStep[200],
  300: uiStep[300],
  400: uiStep[400],
  500: uiStep[500],
} as const;

/**
 * Control heights (`uiControl`): site buttons 36 (`.rc-grade`), card head
 * and option rows on the 44 hit area (`.demo-chat-head`, `.ui-option`),
 * list rows 40. Tags are 24 (`.ui-tag`), which the control tokens do not carry.
 */
export const H = {
  action: uiControl.pill,
  tag: 24,
  head: uiControl.hit,
  option: uiControl.hit,
  row: uiControl.button,
} as const;

/** Site motion: `--site-ease`, colour 150ms, move 200ms. */
export const EASE = uiMotion.easeOut;

export type Elevation = 'ring' | 'raised' | 'overlay' | 'dialog';

function isCssVar(value: string): boolean {
  return value.startsWith('var(');
}

/**
 * Site elevation recipe: hairline ring + contact shadow + wide soft ambient.
 *   ring    `0 0 0 1px` hairline only
 *   raised  `--site-shadow-1` (cards)
 *   overlay `--site-shadow-2` (hovered cards, menus)
 *   dialog  `--site-shadow-3` (drawers, sheets)
 * Web reads the generated `--ui-elevation-*` variables so dark mode follows;
 * native palettes are concrete and read `uiShadow` for their mode.
 */
export function shadow(colors: UiColors, level: Elevation): string {
  if (isCssVar(colors.ink)) return `var(--ui-elevation-${level})`;
  const mode = colors.ink === uiColors.dark.ink ? 'dark' : 'light';
  return uiShadow[mode][level];
}

/** Inset hairline ring (`box-shadow: inset 0 0 0 1px …`), so a sheet's border never adds layout. */
export function insetRing(color: string, width = 1): string {
  return `inset 0 0 0 ${width}px ${color}`;
}

/**
 * The tinted sheets the site stacks, straight from the theme roles:
 * `subtle` (#f9f9f9, inner faces and stages) and `surface` (#f3f3f3, a
 * hovered row / a grey stage).
 */
export function sheets(colors: UiColors) {
  return {
    subtle: colors.subtle,
    surface: colors.surface,
  };
}

/** Focus ring shared by every control here (site `:focus-visible`, 2px ink, offset 2). */
export function focusRing(colors: UiColors, focused: boolean, offset: number = uiFocus.offset): object {
  return {
    outlineStyle: focused ? 'solid' : undefined,
    outlineWidth: focused ? uiFocus.width : 0,
    outlineColor: colors.ink,
    outlineOffset: offset,
  };
}

/** Web-only CSS transition (RN Web passes it through; native ignores it). */
export function transition(props: string, reduced: boolean, ms: number = uiMotion.fast): object {
  return reduced ? {} : { transitionProperty: props, transitionDuration: `${ms}ms`, transitionTimingFunction: EASE };
}
