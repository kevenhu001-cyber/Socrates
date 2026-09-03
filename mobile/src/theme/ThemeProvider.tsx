import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { buildTheme, withAlpha, type Theme, type ThemeMode } from './theme';
import { getItem, setItem } from '../platform/secureStorage';
import { setAppStatusBarStyle } from '../native/statusBar';
import { displayPrefsStore } from '../displayPrefs/displayPrefsStore';

export type ThemePreference = 'dark' | 'light' | 'system';
const STORAGE_KEY = 'socrates.theme.preference';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => Promise<void>;
  toggle: () => Promise<void>;
  ready: boolean;
}

const fallbackTheme = buildTheme('dark');

const ThemeContext = createContext<ThemeContextValue>({
  theme: fallbackTheme,
  mode: 'dark',
  preference: 'dark',
  setPreference: async () => undefined,
  toggle: async () => undefined,
  ready: false,
});

async function writeStoredPreference(value: ThemePreference) {
  try {
    await setItem(STORAGE_KEY, value);
  } catch {
    // best effort
  }
}

/* P0 1:1 helpers — mirror `frontend/src/displayPrefs.js:setAccentCustom`
 * and `frontend/src/util/colors.js:applyCustomBg` so a custom hex
 * produces the same derived tones on both clients. */

function parseHex(hex: string): { h: number; s: number; l: number } | null {
  const h = hex.trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hh = 0;
  let ss = 0;
  const ll = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    ss = ll > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hh = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh /= 6;
  }
  return { h: Math.round(hh * 360), s: Math.round(ss * 100), l: Math.round(ll * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

/* `setAccentCustom` derivation: fg lightness clamped 35–70, bg tone
 * ~35pp darker clamped 8–28. Returns the soft/bg hex for `accentSoft`. */
function deriveAccentSoft(accentHex: string): string {
  const hsl = parseHex(accentHex);
  if (!hsl) return withAlpha(accentHex, 0.16);
  const fgL = Math.max(35, Math.min(70, hsl.l));
  const bgL = Math.max(8, Math.min(28, hsl.l - 35));
  return hslToHex(hsl.h, hsl.s, bgL);
}

/* `applyCustomBg` derivation: keep only lightness (force grayscale to
 * kill historical saturated casts), then offset the four surfaces.
 * Mirrors `frontend/src/util/colors.js:35-80` exactly. */
function deriveBgRamp(overrideHex: string, mode: ThemeMode): {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceHover: string;
} | null {
  const parsed = parseHex(overrideHex);
  if (!parsed) return null;
  const l = parsed.l;
  let b000: string;
  let b100: string;
  let b200: string;
  let b300: string;
  const str = (light: number) => hslToHex(0, 0, Math.round(light));
  if (mode === 'light') {
    b100 = str(l);
    if (l >= 95) {
      b000 = str(96);
      b200 = str(88);
      b300 = str(76);
    } else {
      b000 = str(Math.min(l + 4, 97));
      b200 = str(Math.max(l - 6, 3));
      b300 = str(Math.max(l - 14, 0));
    }
  } else {
    b100 = str(l);
    if (l <= 5) {
      b000 = str(8);
      b200 = str(14);
      b300 = str(22);
    } else {
      b000 = str(Math.min(l + 3.5, 95));
      b200 = str(Math.max(l - 2.7, 0));
      b300 = str(Math.max(l - 6.7, 0));
    }
  }
  /* Role map (`packages/theme/src/rn.ts:16-28`):
   * page=bg-100, raised=bg-200, overlay=bg-000, hover=bg-300. */
  return {
    background: b100,
    surface: b200,
    surfaceRaised: b000,
    surfaceHover: b300,
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [ready, setReady] = React.useState(false);
  const [displayPrefs, setDisplayPrefs] = useState(displayPrefsStore.get());

  useEffect(() => {
    let active = true;
    void getItem(STORAGE_KEY).then((stored) => {
      if (active && stored && (stored === 'light' || stored === 'dark' || stored === 'system')) {
        setPreferenceState(stored as ThemePreference);
      }
      if (active) setReady(true);
    }).catch(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    void displayPrefsStore.hydrate();
    return displayPrefsStore.subscribe(setDisplayPrefs);
  }, []);

  const mode: ThemeMode = preference === 'system'
    ? (systemColorScheme === 'light' ? 'light' : 'dark')
    : preference;

  const theme = useMemo(() => {
    const base = buildTheme(mode);
    const accent = displayPrefs.accentColor;
    const bgOverride = mode === 'dark' ? displayPrefs.bgDark : displayPrefs.bgLight;
    if (!accent && !bgOverride) {
      /* No color overrides — still inject fontScale + contentWidth so
       * consumers can read them off the theme object. */
      return { ...base, fontScale: displayPrefs.fontScale, contentWidth: displayPrefs.contentWidth };
    }
    const accentPatch = accent
      ? {
          accent,
          accentStrong: accent,
          accentSoft: deriveAccentSoft(accent),
          action: accent,
          actionPressed: accent,
        }
      : {};
    const bgRamp = bgOverride ? deriveBgRamp(bgOverride, mode) : null;
    const bgPatch = bgRamp
      ? {
          background: bgRamp.background,
          surface: bgRamp.surface,
          surfaceRaised: bgRamp.surfaceRaised,
          surfaceHover: bgRamp.surfaceHover,
          surfacePressed: bgRamp.surfaceHover,
        }
      : {};
    return {
      ...base,
      fontScale: displayPrefs.fontScale,
      contentWidth: displayPrefs.contentWidth,
      colors: {
        ...base.colors,
        ...accentPatch,
        ...bgPatch,
      },
    };
  }, [mode, displayPrefs]);

  useEffect(() => {
    try {
      setAppStatusBarStyle(theme.colors.statusBarStyle, true);
    } catch {
      // cosmetic only
    }
  }, [theme.colors.statusBarStyle]);

  const setPreference = useCallback(async (next: ThemePreference) => {
    setPreferenceState(next);
    await writeStoredPreference(next);
  }, []);

  const toggle = useCallback(async () => {
    const next: ThemePreference = mode === 'dark' ? 'light' : 'dark';
    setPreferenceState(next);
    await writeStoredPreference(next);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, preference, setPreference, toggle, ready }),
    [theme, mode, preference, setPreference, toggle, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext).theme;
}

export function useThemeController() {
  return useContext(ThemeContext);
}

export function useAppearanceSync() {
  const { preference, setPreference } = useContext(ThemeContext);
  return { preference, system: 'dark' as const, setPreference };
}
