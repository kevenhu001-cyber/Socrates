import { useCallback, useEffect, useState } from 'react';
import { getApiFetch, getCurrentLang, getCurrentUser, getLegacyActions } from '../legacy/gateway.ts';
import { setThemePreference } from '../../displayPrefs.ts';
import { reportSwallow as reportEmptyCatch } from '../../util/reportSwallow.ts';
import type {
  SaveSettingsPreference,
  SettingsLabel,
  SettingsLanguage,
  SettingsPreferencePatch,
} from './settings.types';

type SettingsAccountPreferences = Record<string, unknown>;

function readAccountPreferences(): SettingsAccountPreferences {
  const preferences = getCurrentUser<{ preferences?: unknown }>()?.preferences;
  return preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? preferences as SettingsAccountPreferences
    : {};
}

function hasLocalValue(key: string): boolean {
  try { return localStorage.getItem(key) !== null; }
  catch { return false; }
}

function hasExplicitLanguageChoice(): boolean {
  try { return localStorage.getItem('socrates-lang-user-choice') === '1'; }
  catch { return false; }
}

function readInitialLanguage(): SettingsLanguage {
  const saved = readAccountPreferences().language;
  return !hasExplicitLanguageChoice() && (saved === 'zh' || saved === 'en')
    ? saved
    : getCurrentLang();
}

export function useSettingsPreferences() {
  const [language, setLanguage] = useState<SettingsLanguage>(readInitialLanguage);
  const [saveError, setSaveError] = useState('');
  const label = useCallback<SettingsLabel>(
    (zh, en) => language === 'zh' ? zh : en,
    [language],
  );

  useEffect(() => {
    const preferences = readAccountPreferences();
    if (!hasLocalValue('socrates-theme') && (preferences.theme === 'system' || preferences.theme === 'light' || preferences.theme === 'dark')) {
      setThemePreference(preferences.theme);
    }
    if (!hasExplicitLanguageChoice() && (preferences.language === 'zh' || preferences.language === 'en')) {
      getLegacyActions().profile.setLang(preferences.language);
    }
  }, []);

  const savePreference = useCallback<SaveSettingsPreference>(async (patch: SettingsPreferencePatch) => {
    try {
      const api = getApiFetch();
      if (!api) throw new Error('apiFetch unavailable');
      const savesCustomInstructions = Object.prototype.hasOwnProperty.call(patch, 'customInstructions');
      const endpoint = savesCustomInstructions ? '/api/users/me' : '/api/users/me/preferences';
      const body = savesCustomInstructions ? { customInstructions: patch.customInstructions } : patch;
      const result = await api<{ preferences?: unknown; customInstructions?: unknown }>(endpoint, { method: 'PATCH', body });
      const user = getCurrentUser<{ preferences?: unknown; customInstructions?: unknown }>();
      if (user) {
        if (savesCustomInstructions) user.customInstructions = result.customInstructions;
        else user.preferences = result.preferences;
      }
      setSaveError('');
    } catch {
      setSaveError(label(
        '偏好已保存在此设备；账户同步暂不可用。',
        'Saved on this device; account sync is unavailable.',
      ));
    }
  }, [label]);

  const changeLanguage = useCallback((nextLanguage: string) => {
    setLanguage(nextLanguage as SettingsLanguage);
    try { localStorage.setItem('socrates-lang-user-choice', '1'); }
    catch (error) { reportEmptyCatch(error, 'empty catch: react/settings/useSettingsPreferences.ts:language-choice', 'expected'); }
    getLegacyActions().profile.setLang(nextLanguage);
    void savePreference({ language: nextLanguage });
  }, [savePreference]);

  return {
    language,
    label,
    saveError,
    savePreference,
    changeLanguage,
    reportSaveError: setSaveError,
  };
}
