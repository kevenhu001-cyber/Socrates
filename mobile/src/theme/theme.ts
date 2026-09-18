import { Platform } from 'react-native';
import { buildMappedPalette, type MappedPalette } from '@socrates/theme';

export type ThemeMode = 'light' | 'dark';

/**
 * Color values are derived from `@socrates/theme/rn`'s `buildMappedPalette`,
 * the cross-client source of truth. mobile adds a small set of locally-named
 * fields (`surfaceRaised`, `accentStrong`, `actionPressed`, `brand`,
 * `brandSoft`, `successSoft`, `dangerSoft`, `surfacePressed`,
 * `backgroundSunken`, `textSubtle`, `textInverse`) that downstream
 * components have always imported. They cascade from the canonical palette
 * so a single token change in `@socrates/theme` propagates here.
 *
 * Spacing / radius / typography sizes are still local — see TODO below for
 * the alignment plan. Until those align, components must continue to use
 * the existing field names; only the color *values* change.
 */

export interface Palette {
  mode: 'light' | 'dark';
  /* Page-level background. */
  background: string;
  /** Sunken background — one step below `background`. */
  backgroundSunken: string;
  /** Slightly raised surface (sidebar, chat column, modal body). */
  surface: string;
  /** One step above `surface` (raised surface — cards, popovers). */
  surfaceRaised: string;
  /** Press-state surface (used for active state on tappable surfaces). */
  surfacePressed: string;
  /** Hover-state wash. */
  surfaceHover: string;
  border: string;
  borderSubtle: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textSubtle: string;
  textInverse: string;
  accent: string;
  accentSoft: string;
  /** Brighter accent shade used for emphasized accents. */
  accentStrong: string;
  action: string;
  /** Press-state action color. */
  actionPressed: string;
  /** Modal scrim overlay */
  scrim: string;
  /** Mobile brand identity (distinct from functional accent). */
  brand: string;
  brandSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  /** Semantic warning tone (kept amber — not a brand colour). */
  warning: string;
  white: string;
  black: string;
  overlay: string;
  codeBg: string;
  codeFg: string;
  codeBorder: string;
  reasoningBg: string;
  reasoningFg: string;
  toolCardBg: string;
  toolCardBgHover: string;
  toolCardBgSunken: string;
  toolCardBorder: string;
  toolCardBorderStrong: string;
  toolCardFocus: string;
  scrollbar: string;
  statusBarStyle: 'light' | 'dark';
  /** Primary voice wave / active action blue token aligned with web */
  voiceBlue: string;
  /** Structured access to the underlying canonical palette. */
  readonly source: MappedPalette;
}

function buildPalette(mode: ThemeMode): Palette {
  const base = buildMappedPalette(mode);
  const isDark = mode === 'dark';
  return {
    mode: base.mode,
    source: base,
    /* Flat aliases of the nested `MappedPalette` — keep component code
     * reading `colors.background` instead of `colors.source.bg.page`. */
    background: isDark ? '#000000' : base.bg.page,
    backgroundSunken: isDark ? '#000000' : base.bg.sunken,
    surface: isDark ? '#141414' : base.bg.raised,
    surfaceHover: isDark ? '#262626' : base.bg.hover,
    border: isDark ? 'rgba(255, 255, 255, 0.10)' : base.border.default,
    borderSubtle: base.border.subtle,
    borderStrong: isDark ? 'rgba(255, 255, 255, 0.18)' : base.border.strong,
    text: base.text.primary,
    textSecondary: base.text.secondary,
    textMuted: isDark ? '#8c8c8c' : base.text.muted,
    textSubtle: isDark ? '#666666' : base.text.tertiary,
    textInverse: base.onAccent,
    accent: base.accent.strong,
    accentSoft: base.accent.soft,
    action: base.accent.strong,
    actionPressed: isDark ? '#d4d4d4' : '#333333',
    scrim: isDark ? 'rgba(0, 0, 0, 0.68)' : 'rgba(0, 0, 0, 0.45)',
    voiceBlue: isDark ? '#2b7fff' : '#0a84ff',
    success: base.success,
    danger: base.danger,
    warning: isDark ? '#f5b544' : '#b45309',
    white: base.white,
    black: base.black,
    overlay: base.overlay,
    statusBarStyle: base.statusBarStyle,
    scrollbar: base.scrollbar,
    /* Mobile-local derived fields (aligned with frontend / ChatGPT tokens). */
    surfaceRaised: isDark ? '#212121' : '#f2f2f2',
    surfacePressed: isDark ? '#2f2f2f' : '#e8e8e8',
    accentStrong: isDark ? '#ffffff' : '#111111',
    brand: isDark ? '#d4d4d4' : '#1a1a1a',
    brandSoft: isDark ? '#2a2a2a' : '#e6e6e6',
    successSoft: isDark ? '#1c3a2b' : '#d3e7d8',
    dangerSoft: isDark ? '#3a1f1f' : '#efd2d2',
    codeBg: base.codeBg,
    codeFg: base.codeFg,
    codeBorder: base.codeBorder,
    reasoningBg: base.reasoningBg,
    reasoningFg: base.reasoningFg,
    toolCardBg: base.toolCardBg,
    toolCardBgHover: base.toolCardBgHover,
    toolCardBgSunken: base.toolCardBgSunken,
    toolCardBorder: base.toolCardBorder,
    toolCardBorderStrong: base.toolCardBorderStrong,
    toolCardFocus: base.toolCardFocus,
  };
}

export const palettes: Record<ThemeMode, Palette> = {
  dark: buildPalette('dark'),
  light: buildPalette('light'),
};

export const colors = palettes.dark;

/* Mobile spacing is now aligned with `@socrates/theme`'s 4 px ramp:
 *   xs (4) / sm (8) / md (16) / lg (24) / xl (32) / xxl (40).
 * - `xs`/`sm` map onto frontend `xs`/`sm`.
 * - `md` keeps 16 (already aligned with frontend `lg`; `md` in
 *   mobile code refers to standard card padding, which is the
 *   most common size and matches the React Native ecosystem
 *   baseline).
 * - `lg` shifts from 22 → 24 to match frontend `xl`.
 * - `xl`/`xxl` are dead tokens (zero call sites) but kept with
 *   aligned values so future code can adopt them without a
 *   second migration.
 * Names are preserved on purpose — the migration is value-only.
 *
 * `radius` and `typography.sizes` remain local: the 4 px radius
 * scale tops at `lg=12` which is too small for mobile's larger
 * touch-target UI, and the font ramp carries mobile-specific
 * roles (micro/caption/meta/small/body/bodyLg/input/h1-h4/display
 * with explicit line-heights) that don't map 1:1 onto
 * frontend's 7-step `fontSize` ladder. Forcing alignment here
 * would break the existing visual identity instead of
 * cross-client parity — the goal of UI/functional alignment,
 * not pixel-perfect matching. Reopen when mobile decides to
 * adopt a denser web-style layout. */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
};

export const typography = {
  body: Platform.select({
    web: '"Plus Jakarta Sans", Inter, "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    default: 'PlusJakartaSans_400Regular',
  }) as string,
  medium: Platform.select({
    web: '"Plus Jakarta Sans", Inter, "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    default: 'PlusJakartaSans_500Medium',
  }) as string,
  semibold: Platform.select({
    web: '"Plus Jakarta Sans", Inter, "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    default: 'PlusJakartaSans_600SemiBold',
  }) as string,
  bold: Platform.select({
    web: '"Plus Jakarta Sans", Inter, "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    default: 'PlusJakartaSans_700Bold',
  }) as string,
  display: Platform.select({
    web: '"Newsreader", Georgia, Cambria, "Times New Roman", Times, serif',
    default: 'Newsreader_500Medium',
  }) as string,
  cjk: Platform.select({
    web: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    default: 'NotoSansSC_400Regular',
  }) as string,
  mono: Platform.select({
    web: '"JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace',
    default: 'JetBrainsMono_400Regular',
  }) as string,
  // font sizes match the web mobile 10/11/12/13/14/15/16/18/22/26/30/34 ramp
  sizes: {
    micro: 10,
    caption: 11,
    meta: 12,
    small: 13,
    body: 14,
    bodyLg: 15,
    input: 16,
    h4: 18,
    h3: 22,
    h2: 26,
    h1: 30,
    display: 34,
    lineHeights: {
      micro: 14,
      caption: 16,
      meta: 18,
      small: 19,
      body: 21,
      bodyLg: 23,
      input: 23,
      h4: 26,
      h3: 30,
      h2: 34,
      h1: 38,
      display: 42,
    },
  },
};

export const shadows = {
  card: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 5,
  },
  sheet: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 22,
    elevation: 14,
  },
  authCard: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
};

export interface Theme {
  mode: ThemeMode;
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadows: typeof shadows;
  fontScale: number;
  contentWidth: number;
}

export function buildTheme(mode: ThemeMode): Theme {
  return {
    mode,
    colors: palettes[mode],
    spacing,
    radius,
    typography,
    shadows,
    fontScale: 1,
    contentWidth: 720,
  };
}

export function withAlpha(color: string, alpha: number): string {
  if (!color) return `rgba(0, 0, 0, ${alpha})`;
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.slice(0, 2), 16);
    const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.slice(2, 4), 16);
    const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (color.startsWith('rgb')) {
    return color.replace(/rgb(a)?\(([^)]+)\)/, (_, __, val) => {
      const parts = val.split(',').map((s: string) => s.trim());
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    });
  }
  return color;
}
