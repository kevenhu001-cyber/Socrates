/**
 * RN-native helpers built on top of `@socrates/theme/tokens`.
 *
 * React Native does not parse `hsl(H S% L%)` triplet strings — only hex
 * / rgb / rgba / named colors. This module precomputes the canonical
 * hex equivalent of every token color so RN components can consume
 * them without rewriting the palette. The values are intentionally
 * stable: do not introduce per-mode drift between tokens.ts and the
 * hex table; if either changes, regenerate both.
 *
 * Source: `frontend/src/styles/tokens.css` (HSL triplet column),
 * resolved against the corresponding `themes.css` hex for `bg.page`.
 */

import {
  palettes,
  type ThemePalette,
  type ThemeMode,
} from './tokens';

export interface ThemePaletteHex extends Omit<ThemePalette, 'accent' | 'bg' | 'text' | 'border' | 'danger' | 'success' | 'muted' | 'onAccent'> {
  readonly accent: {
    readonly strong: string;
    readonly soft: string;
    readonly surface: string;
  };
  readonly bg: {
    readonly page: string;
    readonly raised: string;
    readonly overlay: string;
    readonly hover: string;
    readonly sunken: string;
  };
  readonly text: {
    readonly primary: string;
    readonly secondary: string;
    readonly tertiary: string;
    readonly muted: string;
    readonly disabled: string;
  };
  readonly border: {
    readonly subtle: string;
    readonly default: string;
    readonly strong: string;
  };
  readonly danger: string;
  readonly success: string;
  readonly muted: string;
  readonly onAccent: string;
}

const darkHex: ThemePaletteHex = {
  mode: 'dark',
  accent: {
    strong: '#e9be53',
    soft: '#5a4720',
    surface: '#5a4720',
  },
  bg: {
    page: '#101318',
    raised: '#212121',
    overlay: '#292929',
    hover: '#363636',
    sunken: '#0d0d0d',
  },
  text: {
    primary: '#ffffff',
    secondary: '#cccccc',
    tertiary: '#a6a6a6',
    muted: '#8c8c8c',
    disabled: '#737373',
  },
  border: {
    subtle: '#383838',
    default: '#383838',
    strong: '#525252',
  },
  danger: '#d96868',
  success: '#3dd27d',
  muted: '#808080',
  onAccent: '#ffffff',
};

const lightHex: ThemePaletteHex = {
  mode: 'light',
  accent: {
    strong: '#a06b18',
    soft: '#e7c98a',
    surface: '#e7c98a',
  },
  bg: {
    page: '#e6dec8',
    raised: '#f5f1e7',
    overlay: '#ebe4d3',
    hover: '#ded8c3',
    sunken: '#fbf8ef',
  },
  text: {
    primary: '#1a160e',
    secondary: '#4d443a',
    tertiary: '#605744',
    muted: '#756b56',
    disabled: '#8a806b',
  },
  border: {
    subtle: '#dcd3bd',
    default: '#c8bfa6',
    strong: '#b8ad8e',
  },
  danger: '#a83a3a',
  success: '#2f7a52',
  muted: '#807561',
  onAccent: '#ffffff',
};

export const palettesHex: Readonly<Record<ThemeMode, ThemePaletteHex>> = {
  dark: darkHex,
  light: lightHex,
};

export function getThemePaletteHex(mode: ThemeMode): ThemePaletteHex {
  return palettesHex[mode];
}

/** Drop-in replacement for mobile's existing `Palette` shape so the
 *  ThemeProvider can swap its source without touching call-sites.
 *  Add new fields here when mobile's local `theme.ts` adds more. */
export interface MappedPalette extends ThemePaletteHex {
  /** `statusBarStyle` is an RN/Expo convention not in tokens.ts. */
  readonly statusBarStyle: 'light' | 'dark';
  /** `white` / `black` convenience colors used by mobile buttons. */
  readonly white: string;
  readonly black: string;
  /** Generic scrollbar tint. */
  readonly scrollbar: string;
  /** Generic overlay tint (for backdrop modals). */
  readonly overlay: string;
  /** Reasoning card backgrounds — used by MessageBubble. */
  readonly reasoningBg: string;
  readonly reasoningFg: string;
  /** Code block container colors. */
  readonly codeBg: string;
  readonly codeFg: string;
  readonly codeBorder: string;
  /** Tool card container colors. */
  readonly toolCardBg: string;
  readonly toolCardBgHover: string;
  readonly toolCardBgSunken: string;
  readonly toolCardBorder: string;
  readonly toolCardBorderStrong: string;
  readonly toolCardFocus: string;
}

export function buildMappedPalette(mode: ThemeMode): MappedPalette {
  const base = palettesHex[mode];
  const isDark = mode === 'dark';
  return {
    ...base,
    statusBarStyle: isDark ? 'light' : 'dark',
    white: '#ffffff',
    black: '#000000',
    scrollbar: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(26,22,14,0.20)',
    overlay: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(26,22,14,0.45)',
    reasoningBg: isDark ? '#1a1d24' : '#e1d6b8',
    reasoningFg: isDark ? '#9da4af' : '#4d443a',
    codeBg: isDark ? '#0a0c10' : '#ddd2b6',
    codeFg: isDark ? '#e7eaf0' : '#1a160e',
    codeBorder: isDark ? '#1f2330' : '#b8ac8e',
    toolCardBg: isDark ? 'rgba(255,255,255,0.062)' : 'rgba(26,22,14,0.05)',
    toolCardBgHover: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(26,22,14,0.08)',
    toolCardBgSunken: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(26,22,14,0.032)',
    toolCardBorder: isDark ? 'rgba(255,255,255,0.095)' : 'rgba(26,22,14,0.11)',
    toolCardBorderStrong: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(26,22,14,0.19)',
    toolCardFocus: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(26,22,14,0.35)',
  };
}
