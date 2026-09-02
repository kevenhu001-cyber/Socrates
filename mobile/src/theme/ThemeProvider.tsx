import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { buildTheme, type Theme, type ThemeMode } from './theme';
import { getItem, setItem } from '../platform/secureStorage';
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
    // best effort
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [ready, setReady] = React.useState(false);

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

  const mode: ThemeMode = preference === 'system'
    ? (systemColorScheme === 'light' ? 'light' : 'dark')
    : preference;

  const theme = useMemo(() => buildTheme(mode), [mode]);

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
