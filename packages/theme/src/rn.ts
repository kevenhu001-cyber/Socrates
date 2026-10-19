/**
 * RN-native helpers built on top of `@socrates/theme/tokens`.
 *
 * React Native consumes concrete color strings rather than the HSL triplets
 * used by shared tokens. Socrates Universal projects its neutral palette into the native palette shape.
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
    page: '#212121',
    raised: '#303030',
    overlay: '#2f2f2f',
    hover: '#333333',
    sunken: '#171717',
  },
  text: {
    primary: '#ececec',
    secondary: '#b4b4b4',
    tertiary: '#9b9b9b',
    muted: '#9b9b9b',
    disabled: '#777777',
  },
  border: {
    subtle: '#292929',
    default: '#383838',
    strong: '#454545',
  },
  danger: '#e95350',
  success: '#80c933',
  muted: '#9b9b9b',
  onAccent: '#000000',
};

const lightHex: ThemePaletteHex = {
  mode: 'light',
  accent: {
    strong: '#222222',
    soft: '#f4f4f4',
    surface: '#f4f4f4',
  },
  bg: {
    page: '#ffffff',
    raised: '#ffffff',
    overlay: '#ffffff',
    hover: '#f4f4f4',
    sunken: '#f9f9f9',
  },
  text: {
    primary: '#1f1f1f',
    secondary: '#666666',
    tertiary: '#737373',
    muted: '#737373',
    disabled: '#b0b0b0',
  },
  border: {
    subtle: '#eeeeee',
    default: '#e3e3e3',
    strong: '#dddddd',
  },
  danger: '#f35837',
  success: '#00a03f',
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

/**
 * Web surface roles mirrored for React Native. These remain product-level
 * roles even though their values derive from the Universal neutral foundation.
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
  sidebar: '#171717',
  bubble: '#303030',
  bubbleStrong: '#303030',
  composer: '#303030',
  composerBorder: '#454545',
  composerBorderCompact: '#454545',
  control: '#383838',
  controlCompact: '#383838',
  surface: '#2f2f2f',
  hoverGhost: 'rgba(255, 255, 255, 0.06)',
  chip: 'rgba(255, 255, 255, 0.06)',
  avatar: '#454545',
  placeholder: '#9b9b9b',
};

const lightSurfaces: UiSurfaceHex = {
  sidebar: '#f9f9f9',
  bubble: '#f4f4f4',
  bubbleStrong: '#f4f4f4',
  composer: '#f4f4f4',
  composerBorder: '#e3e3e3',
  composerBorderCompact: '#e3e3e3',
  control: '#f5f5f5',
  controlCompact: '#f5f5f5',
  surface: '#f9f9f9',
  hoverGhost: 'rgba(0, 0, 0, 0.03)',
  chip: 'rgba(0, 0, 0, 0.03)',
  avatar: '#8a8a8a',
  placeholder: '#737373',
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
    reasoningBg: isDark ? '#171717' : '#f9f9f9',
    reasoningFg: isDark ? '#b4b4b4' : '#666666',
    codeBg: isDark ? '#171717' : '#f9f9f9',
    codeFg: isDark ? '#ececec' : '#1f1f1f',
    codeBorder: isDark ? '#383838' : '#e3e3e3',
    toolCardBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
    toolCardBgHover: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
    toolCardBgSunken: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
    toolCardBorder: isDark ? '#383838' : '#e3e3e3',
    toolCardBorderStrong: isDark ? '#454545' : '#dddddd',
    toolCardFocus: isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.32)',
  };
}
