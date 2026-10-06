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
 * Source: the canonical HSL palettes in `frontend/src/ui/tokens.ts`.
 * This table keeps their exact hex equivalents for React Native, which
 * does not parse the HSL triplet strings used by CSS and shared tokens.
 *
 * The returned table is a direct HSL-to-hex projection of the canonical
 * frontend palette; native surfaces share its mode-specific color roles.
 */

import {
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
  /* Monochrome accent values from the shared frontend HSL palette. */
  accent: {
    strong: '#f0f0f0',
    soft: '#2e2e2e',
    surface: '#2e2e2e',
  },
  /* HSL-to-hex equivalents of `frontend/src/ui/tokens.ts`. */
  bg: {
    page: '#141414',
    raised: '#1c1c1c',
    overlay: '#292929',
    hover: '#2b2b2b',
    sunken: '#0d0d0d',
  },
  text: {
    primary: '#e8e8e8',
    secondary: '#c2c2c2',
    tertiary: '#9c9c9c',
    muted: '#808080',
    disabled: '#616161',
  },
  border: {
    subtle: '#262626',
    default: '#303030',
    strong: '#404040',
  },
  danger: '#ff6966',
  success: '#3fdec1',
  muted: '#808080',
  onAccent: '#000000',
};

const lightHex: ThemePaletteHex = {
  mode: 'light',
  accent: {
    strong: '#0d0d0d',
    soft: '#e8e8e8',
    surface: '#e8e8e8',
  },
  bg: {
    page: '#ffffff',
    raised: '#fafafa',
    overlay: '#ffffff',
    hover: '#f2f2f2',
    sunken: '#ffffff',
  },
  text: {
    primary: '#0d0d0d',
    secondary: '#5c5c5c',
    tertiary: '#6e6e6e',
    muted: '#737373',
    disabled: '#b5b5b5',
  },
  border: {
    subtle: '#f0f0f0',
    default: '#e6e6e6',
    strong: '#cccccc',
  },
  danger: '#d72319',
  success: '#027e6b',
  muted: '#737373',
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
    scrollbar: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.20)',
    overlay: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.45)',
    reasoningBg: isDark ? '#1a1a1a' : '#efefef',
    reasoningFg: isDark ? '#a0a0a0' : '#4a4a4a',
    codeBg: isDark ? '#0a0a0a' : '#f0f0f0',
    codeFg: isDark ? '#e7e7e7' : '#1a1a1a',
    codeBorder: isDark ? '#232323' : '#d0d0d0',
    toolCardBg: isDark ? 'rgba(255,255,255,0.062)' : 'rgba(0,0,0,0.05)',
    toolCardBgHover: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    toolCardBgSunken: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.032)',
    toolCardBorder: isDark ? 'rgba(255,255,255,0.095)' : 'rgba(0,0,0,0.11)',
    toolCardBorderStrong: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.19)',
    toolCardFocus: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
  };
}
