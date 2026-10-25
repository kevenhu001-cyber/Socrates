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
    strong: '#ededed',
    soft: '#1f1f1f',
    surface: '#1f1f1f',
  },
  bg: {
    /* Four-step ladder, projected from four consecutive steps of the Geist
     * surface ramp: L1 #0a0a0a → L2 #1a1a1a → L3 #1f1f1f → L4 #292929.
     * The canvas is a near-black, never pure #000. */
    page: '#0a0a0a',
    raised: '#1f1f1f',
    overlay: '#292929',
    hover: '#363636',
    sunken: '#0a0a0a',
  },
  text: {
    primary: '#ededed',
    secondary: '#a1a1a1',
    tertiary: '#999999',
    muted: '#999999',
    disabled: '#999999',
  },
  border: {
    subtle: '#292929',
    default: '#2e2e2e',
    strong: '#454545',
  },
  danger: '#f07775',
  success: '#80c933',
  muted: '#999999',
  onAccent: '#0a0a0a',
};

const lightHex: ThemePaletteHex = {
  mode: 'light',
  accent: {
    strong: '#171717',
    soft: '#ebebeb',
    surface: '#ebebeb',
  },
  bg: {
    /* Same four-step ladder as dark mode, running the other way:
     * L1 #ffffff → L2 #fafafa → L3 #f2f2f2 → L4 #ebebeb. The canvas is
     * L2; the paper (L1) is what raised and overlay surfaces are cut from,
     * so they read as lighter than the page they stand on. */
    page: '#fafafa',
    raised: '#ffffff',
    overlay: '#ffffff',
    hover: '#e0e0e0',
    sunken: '#ebebeb',
  },
  text: {
    primary: '#171717',
    secondary: '#4d4d4d',
    tertiary: '#666666',
    muted: '#666666',
    disabled: '#8f8f8f',
  },
  border: {
    subtle: '#ebebeb',
    default: '#eaeaea',
    strong: '#c9c9c9',
  },
  danger: '#b02d1c',
  success: '#0c6e33',
  muted: '#666666',
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
  sidebar: '#1a1a1a',
  bubble: '#2e2e2e',
  bubbleStrong: '#454545',
  composer: '#292929',
  composerBorder: '#2e2e2e',
  composerBorderCompact: '#2e2e2e',
  control: '#2e2e2e',
  controlCompact: '#2e2e2e',
  surface: '#292929',
  hoverGhost: 'rgba(255, 255, 255, 0.06)',
  chip: 'rgba(255, 255, 255, 0.06)',
  avatar: '#2e2e2e',
  placeholder: '#999999',
};

const lightSurfaces: UiSurfaceHex = {
  sidebar: '#f2f2f2',
  bubble: '#ebebeb',
  bubbleStrong: '#e6e6e6',
  composer: '#ffffff',
  composerBorder: '#c9c9c9',
  composerBorderCompact: '#c9c9c9',
  control: '#ebebeb',
  controlCompact: '#ebebeb',
  surface: '#ffffff',
  hoverGhost: 'rgba(0, 0, 0, 0.05)',
  chip: 'rgba(0, 0, 0, 0.05)',
  avatar: '#666666',
  placeholder: '#8f8f8f',
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
    reasoningBg: isDark ? '#1a1a1a' : '#f2f2f2',
    reasoningFg: isDark ? '#a1a1a1' : '#4d4d4d',
    codeBg: isDark ? '#1f1f1f' : '#ffffff',
    codeFg: isDark ? '#ededed' : '#171717',
    codeBorder: isDark ? '#2e2e2e' : '#eaeaea',
    toolCardBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    toolCardBgHover: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)',
    toolCardBgSunken: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
    toolCardBorder: isDark ? '#2e2e2e' : '#eaeaea',
    toolCardBorderStrong: isDark ? '#454545' : '#c9c9c9',
    toolCardFocus: isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.32)',
  };
}
