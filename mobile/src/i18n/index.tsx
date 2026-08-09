import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { STRINGS, type Language, type StringKey } from './strings';

const STORAGE_KEY = 'socrates.language.preference';

/**
 * Best-effort device language. `expo-localization` is not a dependency, so this
 * reads whatever the platform already exposes and falls back to English. Every
 * access is guarded: a missing native module must never block the first render.
 */
export function detectDeviceLanguage(): Language {
  let tag = '';
  try {
    if (Platform.OS === 'android') {
      tag = String(NativeModules?.I18nManager?.localeIdentifier || '');
    } else {
      const settings = NativeModules?.SettingsManager?.settings;
      tag = String(settings?.AppleLocale || settings?.AppleLanguages?.[0] || '');
    }
    if (!tag && typeof Intl !== 'undefined') {
      tag = String(Intl.DateTimeFormat().resolvedOptions().locale || '');
    }
  } catch {
    return 'en';
  }
  return /^zh/i.test(tag.replace('_', '-')) ? 'zh' : 'en';
}

/**
 * Look up `key` in `language`, falling back to English and finally to the key
 * itself. `{name}`-style placeholders are replaced from `vars`, matching the
 * web client's `t()` contract.
 */
export function translate(
  language: Language,
  key: StringKey | string,
  vars?: Record<string, string | number>,
): string {
  const table = STRINGS[language] as Record<string, string>;
  const raw = table[key] ?? (STRINGS.en as Record<string, string>)[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => (
    name in vars ? String(vars[name]) : match
  ));
}

export type Translate = (key: StringKey | string, vars?: Record<string, string | number>) => string;

/**
 * The language the provider last resolved. Non-React callers (the store, API
 * error paths) read it through `tSync`; the provider is the only writer.
 */
let activeLanguage: Language = 'en';

/** Translate outside React. Components should use `useT()` so they re-render. */
export const tSync: Translate = (key, vars) => translate(activeLanguage, key, vars);

export function getActiveLanguage(): Language {
  return activeLanguage;
}

interface I18nContextValue {
  language: Language;
  setLanguage: (next: Language) => Promise<void>;
  t: Translate;
  ready: boolean;
}

const fallbackValue: I18nContextValue = {
  language: 'en',
  setLanguage: async () => undefined,
  t: (key, vars) => translate('en', key, vars),
  ready: false,
};

const I18nContext = createContext<I18nContextValue>(fallbackValue);

async function readStoredLanguage(): Promise<Language | null> {
  try {
    const value = await SecureStore.getItemAsync(STORAGE_KEY);
    if (value === 'en' || value === 'zh') return value;
  } catch {
    // ignore — fall back to the device locale
  }
  return null;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectDeviceLanguage);
  const [ready, setReady] = useState(false);

  // Keep the non-React accessor pointed at the same language the tree renders.
  activeLanguage = language;

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await readStoredLanguage();
      if (!active) return;
      if (stored) setLanguageState(stored);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(async (next: Language) => {
    setLanguageState(next);
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, next);
    } catch {
      // best effort; the in-memory choice still applies for this session
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    ready,
    t: (key, vars) => translate(language, key, vars),
  }), [language, setLanguage, ready]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** The translate function alone — what screens normally need. */
export function useT(): Translate {
  return useContext(I18nContext).t;
}

/** Full control, for the language picker in Settings. */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export type { Language, StringKey };
