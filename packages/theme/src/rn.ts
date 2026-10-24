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
    soft: '#131313',
    surface: '#131313',
  },
  bg: {
    /* Four-step ladder: L1 #080808 → L2 #0d0d0d → L3 #131313 → L4 #181818.
     * Perceived-lightness steps are 1.96% / 2.35% / 1.96%, all inside the
     * 1.5%-3% band. The canvas is a near-black, never pure #000. */
    page: '#080808',
    raised: '#131313',
    overlay: '#181818',
    hover: '#323232',
    sunken: '#080808',
  },
  text: {
    primary: '#f3f3f3',
    secondary: '#b4b4b4',
    tertiary: '#9b9b9b',
    muted: '#9b9b9b',
    disabled: '#9b9b9b',
  },
  border: {
    subtle: '#181818',
    default: '#202020',
    strong: '#2d2d2d',
  },
  danger: '#e95350',
  success: '#80c933',
  muted: '#9b9b9b',
  onAccent: '#080808',
};

const lightHex: ThemePaletteHex = {
  mode: 'light',
  accent: {
    strong: '#111111',
    soft: '#f0f0f0',
    surface: '#f0f0f0',
  },
  bg: {
    /* Same four-step ladder as dark mode, running the other way:
     * L1 #ffffff → L2 #fafafa → L3 #f6f6f6 → L4 #f0f0f0. The canvas is
     * L2; the paper (L1) is what raised and overlay surfaces are cut from,
     * so they read as lighter than the page they stand on. */
    page: '#fafafa',
    raised: '#ffffff',
    overlay: '#ffffff',
    hover: '#e5e5e5',
    sunken: '#f0f0f0',
  },
  text: {
    primary: '#111111',
    secondary: '#595959',
    tertiary: '#6b6b6b',
    muted: '#6b6b6b',
    disabled: '#8f8f8f',
  },
  border: {
    subtle: '#f0f0f0',
    default: '#e5e5e5',
    strong: '#d4d4d4',
  },
  danger: '#f35837',
  success: '#00a03f',
  muted: '#6b6b6b',
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
  sidebar: '#0d0d0d',
  bubble: '#2a2a2a',
  bubbleStrong: '#2e2e2e',
  composer: '#181818',
  composerBorder: '#2d2d2d',
  composerBorderCompact: '#2d2d2d',
  control: '#2e2e2e',
  controlCompact: '#2e2e2e',
  surface: '#181818',
  hoverGhost: 'rgba(255, 255, 255, 0.06)',
  chip: 'rgba(255, 255, 255, 0.06)',
  avatar: '#2d2d2d',
  placeholder: '#9b9b9b',
};

const lightSurfaces: UiSurfaceHex = {
  sidebar: '#f6f6f6',
  bubble: '#f0f0f0',
  bubbleStrong: '#e5e5e5',
  composer: '#ffffff',
  composerBorder: '#e5e5e5',
  composerBorderCompact: '#e5e5e5',
  control: '#f0f0f0',
  controlCompact: '#f0f0f0',
  surface: '#ffffff',
  hoverGhost: 'rgba(0, 0, 0, 0.03)',
  chip: 'rgba(0, 0, 0, 0.03)',
  avatar: '#8a8a8a',
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
    reasoningBg: isDark ? '#0d0d0d' : '#f6f6f6',
    reasoningFg: isDark ? '#b4b4b4' : '#595959',
    codeBg: isDark ? '#131313' : '#ffffff',
    codeFg: isDark ? '#f3f3f3' : '#111111',
    codeBorder: isDark ? '#202020' : '#e5e5e5',
    toolCardBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
    toolCardBgHover: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
    toolCardBgSunken: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
    toolCardBorder: isDark ? '#202020' : '#e5e5e5',
    toolCardBorderStrong: isDark ? '#2d2d2d' : '#d4d4d4',
    toolCardFocus: isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.32)',
  };
}
