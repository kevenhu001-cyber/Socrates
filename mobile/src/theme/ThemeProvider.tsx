import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { buildTheme, type Theme, type ThemeMode } from './theme';
import { setItem } from '../platform/secureStorage';
import { setAppStatusBarStyle } from '../native/statusBar';

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
    // best effort; the in-memory value still applies
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The web mobile breakpoint intentionally uses a true-black composition
  // regardless of the OS appearance. Keep native startup deterministic too:
  // restoring a historical light/system preference must never flash beige.
  const mode: ThemeMode = 'dark';
  const preference: ThemePreference = 'dark';
  const theme = useMemo(() => buildTheme('dark'), []);

  useEffect(() => {
    // Never let a status-bar tweak take down the app again.
    try {
      setAppStatusBarStyle(theme.colors.statusBarStyle, true);
    } catch {
      // cosmetic only — the app must keep rendering
    }
  }, [theme.colors.statusBarStyle]);

  const setPreference = useCallback(async (_next: ThemePreference) => {
    await writeStoredPreference('dark');
  }, []);

  const toggle = useCallback(async () => writeStoredPreference('dark'), []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, preference, setPreference, toggle, ready: true }),
    [theme, setPreference, toggle],
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
