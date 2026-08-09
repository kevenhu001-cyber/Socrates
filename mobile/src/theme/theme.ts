import { Platform } from 'react-native';

export type ThemeMode = 'dark' | 'light';

export interface Palette {
  background: string;
  backgroundSunken: string;
  surface: string;
  surfaceRaised: string;
  surfacePressed: string;
  surfaceHover: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textInverse: string;
  accent: string;
  accentSoft: string;
  accentStrong: string;
  action: string;
  actionPressed: string;
  brand: string;
  brandSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
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
}

const darkPalette: Palette = {
  background: '#000000',
  backgroundSunken: '#000000',
  surface: '#171717',
  surfaceRaised: '#232323',
  surfacePressed: '#2d2d2d',
  surfaceHover: '#292929',
  border: '#303030',
  borderStrong: '#393939',
  text: '#f7f7f7',
  textMuted: '#a3a3a3',
  textSubtle: '#777777',
  textInverse: '#111111',
  accent: '#e9be53',
  accentSoft: '#342b18',
  accentStrong: '#f2cb67',
  action: '#3d83f5',
  actionPressed: '#2f6ed4',
  brand: '#cb9543',
  brandSoft: '#2a1f0c',
  success: '#61c995',
  successSoft: '#1c3a2b',
  danger: '#ef7777',
  dangerSoft: '#3a1f1f',
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.55)',
  codeBg: '#0a0c10',
  codeFg: '#e7eaf0',
  codeBorder: '#1f2330',
  reasoningBg: '#1a1d24',
  reasoningFg: '#9da4af',
  toolCardBg: 'rgba(255,255,255,0.062)',
  toolCardBgHover: 'rgba(255,255,255,0.10)',
  toolCardBgSunken: 'rgba(255,255,255,0.04)',
  toolCardBorder: 'rgba(255,255,255,0.095)',
  toolCardBorderStrong: 'rgba(255,255,255,0.15)',
  toolCardFocus: 'rgba(255,255,255,0.35)',
  scrollbar: 'rgba(255,255,255,0.18)',
  statusBarStyle: 'light',
};

const lightPalette: Palette = {
  background: '#E6DEC8',
  backgroundSunken: '#dcd2b6',
  surface: '#efe8d4',
  surfaceRaised: '#f6f0dd',
  surfacePressed: '#e2d8be',
  surfaceHover: '#ece2c8',
  border: '#c7bda3',
  borderStrong: '#a99e83',
  text: '#221a0e',
  textMuted: '#5b513f',
  textSubtle: '#7a6e57',
  textInverse: '#E6DEC8',
  accent: '#a06b18',
  accentSoft: '#e7c98a',
  accentStrong: '#7d510d',
  action: '#3d83f5',
  actionPressed: '#2f6ed4',
  brand: '#9a5f1d',
  brandSoft: '#ead8b3',
  success: '#2f7a52',
  successSoft: '#d3e7d8',
  danger: '#a83a3a',
  dangerSoft: '#efd2d2',
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(34,26,14,0.45)',
  codeBg: '#ddd2b6',
  codeFg: '#221a0e',
  codeBorder: '#b8ac8e',
  reasoningBg: '#e1d6b8',
  reasoningFg: '#5b513f',
  toolCardBg: 'rgba(34,26,14,0.05)',
  toolCardBgHover: 'rgba(34,26,14,0.08)',
  toolCardBgSunken: 'rgba(34,26,14,0.032)',
  toolCardBorder: 'rgba(34,26,14,0.11)',
  toolCardBorderStrong: 'rgba(34,26,14,0.19)',
  toolCardFocus: 'rgba(34,26,14,0.35)',
  scrollbar: 'rgba(34,26,14,0.20)',
  statusBarStyle: 'dark',
};

export const palettes: Record<ThemeMode, Palette> = {
  dark: darkPalette,
  light: lightPalette,
};

export const colors = darkPalette;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
  xxl: 42,
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
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  display: 'Newsreader_500Medium',
  cjk: 'NotoSansSC_400Regular',
  mono: Platform.select({ android: 'monospace', default: 'Courier New' }) || 'Courier New',
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
};

export interface Theme {
  mode: ThemeMode;
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadows: typeof shadows;
}

export function buildTheme(mode: ThemeMode): Theme {
  return { mode, colors: palettes[mode], spacing, radius, typography, shadows };
}
