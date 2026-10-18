/**
 * RN-native helpers built on top of `@socrates/theme/tokens`.
 *
 * React Native consumes concrete color strings rather than the HSL triplets
 * used by shared tokens. Socrates Design System v2 projects the Lobe UI v6
 * default neutral values into the existing native palette shape.
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
  accent: {
    strong: '#eeeeee',
    soft: '#111111',
    surface: '#111111',
  },
  bg: {
    page: '#000000',
    raised: '#0d0d0d',
    overlay: '#1a1a1a',
    hover: '#202020',
    sunken: '#060606',
  },
  text: {
    primary: '#e6e6e6',
    secondary: '#b4b4b4',
    tertiary: '#8f8f8f',
    muted: '#8f8f8f',
    disabled: '#6b6b6b',
  },
  border: {
    subtle: '#1a1a1a',
    default: '#202020',
    strong: '#2d2d2d',
  },
  danger: '#e95350',
  success: '#80c933',
  muted: '#8f8f8f',
  onAccent: '#000000',
};

const lightHex: ThemePaletteHex = {
  mode: 'light',
  accent: {
    strong: '#222222',
    soft: '#f5f5f5',
    surface: '#f5f5f5',
  },
  bg: {
    page: '#f8f8f8',
    raised: '#ffffff',
    overlay: '#ffffff',
    hover: '#eeeeee',
    sunken: '#fbfbfb',
  },
  text: {
    primary: '#1f1f1f',
    secondary: '#666666',
    tertiary: '#8a8a8a',
    muted: '#8a8a8a',
    disabled: '#b0b0b0',
  },
  border: {
    subtle: '#eeeeee',
    default: '#e3e3e3',
    strong: '#dddddd',
  },
  danger: '#f35837',
  success: '#00a03f',
  muted: '#8a8a8a',
  onAccent: '#ffffff',
};

export const palettesHex: Readonly<Record<ThemeMode, ThemePaletteHex>> = {
  dark: darkHex,
  light: lightHex,
};

export function getThemePaletteHex(mode: ThemeMode): ThemePaletteHex {
  return palettesHex[mode];
}

/**
 * Web surface roles mirrored for React Native. These remain product-level
 * roles even though their values now derive from the Lobe neutral foundation.
 */
export interface UiSurfaceHex {
  readonly sidebar: string;
  readonly bubble: string;
  readonly bubbleStrong: string;
  readonly composer: string;
  readonly composerBorder: string;
  readonly composerBorderCompact: string;
  readonly control: string;
  readonly controlCompact: string;
  readonly surface: string;
  readonly hoverGhost: string;
  readonly chip: string;
  readonly avatar: string;
  readonly placeholder: string;
}

const darkSurfaces: UiSurfaceHex = {
  sidebar: '#0d0d0d',
  bubble: '#1a1a1a',
  bubbleStrong: '#1a1a1a',
  composer: '#0d0d0d',
  composerBorder: '#202020',
  composerBorderCompact: '#202020',
  control: '#2d2d2d',
  controlCompact: '#2d2d2d',
  surface: '#1a1a1a',
  hoverGhost: 'rgba(255, 255, 255, 0.06)',
  chip: 'rgba(255, 255, 255, 0.06)',
  avatar: '#2d2d2d',
  placeholder: '#6b6b6b',
};

const lightSurfaces: UiSurfaceHex = {
  sidebar: '#ffffff',
  bubble: '#ffffff',
  bubbleStrong: '#ffffff',
  composer: '#ffffff',
  composerBorder: '#e3e3e3',
  composerBorderCompact: '#e3e3e3',
  control: '#f5f5f5',
  controlCompact: '#f5f5f5',
  surface: '#ffffff',
  hoverGhost: 'rgba(0, 0, 0, 0.03)',
  chip: 'rgba(0, 0, 0, 0.03)',
  avatar: '#8a8a8a',
  placeholder: '#b0b0b0',
};

const surfacesHex: Readonly<Record<ThemeMode, UiSurfaceHex>> = {
  dark: darkSurfaces,
  light: lightSurfaces,
};

export function getUiSurfaceHex(mode: ThemeMode): UiSurfaceHex {
  return surfacesHex[mode];
}

export interface MappedPalette extends ThemePaletteHex {
  readonly statusBarStyle: 'light' | 'dark';
  readonly white: string;
  readonly black: string;
  readonly scrollbar: string;
  readonly overlay: string;
  readonly reasoningBg: string;
  readonly reasoningFg: string;
  readonly codeBg: string;
  readonly codeFg: string;
  readonly codeBorder: string;
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
    scrollbar: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)',
    overlay: 'rgba(0,0,0,0.44)',
    reasoningBg: isDark ? '#0d0d0d' : '#ffffff',
    reasoningFg: isDark ? '#8f8f8f' : '#666666',
    codeBg: isDark ? '#0d0d0d' : '#ffffff',
    codeFg: isDark ? '#e6e6e6' : '#1f1f1f',
    codeBorder: isDark ? '#202020' : '#eeeeee',
    toolCardBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
    toolCardBgHover: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
    toolCardBgSunken: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
    toolCardBorder: isDark ? '#202020' : '#e3e3e3',
    toolCardBorderStrong: isDark ? '#2d2d2d' : '#dddddd',
    toolCardFocus: isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.32)',
  };
}
