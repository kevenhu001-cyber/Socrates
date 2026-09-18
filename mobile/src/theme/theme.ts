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
 * The flat field names are retained for component compatibility, but their
 * values now resolve directly to the shared web roles. ThemeProvider applies
 * the web app's pure-black page canvas at runtime; the permanent desktop
 * shell gives the navigation rail its separate deep-gray surface.
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
    background: base.bg.page,
    backgroundSunken: base.bg.sunken,
    surface: base.bg.raised,
    surfaceHover: base.bg.hover,
    border: base.border.default,
    borderSubtle: base.border.subtle,
    borderStrong: base.border.strong,
    text: base.text.primary,
    textSecondary: base.text.secondary,
    textMuted: base.text.muted,
    textSubtle: base.text.tertiary,
    textInverse: base.onAccent,
    accent: base.accent.strong,
    accentSoft: base.accent.soft,
    action: base.accent.strong,
    actionPressed: base.bg.hover,
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
    surfaceRaised: base.bg.overlay,
    surfacePressed: base.bg.hover,
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

/* These names are kept because screens use them directly. Their values are
 * the shared 4px rhythm from `@socrates/theme`, so native cards, sheets and
 * the web workspace use the same spacing ladder. */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
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
