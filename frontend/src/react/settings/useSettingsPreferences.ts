import { useCallback, useState } from 'react';
import { getApiFetch, getCurrentLang, getCurrentUser, getLegacyActions } from '../legacy/gateway.ts';
import type {
  SaveSettingsPreference,
  SettingsLabel,
  SettingsLanguage,
  SettingsPreferencePatch,
} from './settings.types';

export function useSettingsPreferences() {
  const [language, setLanguage] = useState<SettingsLanguage>(() => getCurrentLang());
  const [saveError, setSaveError] = useState('');
  const label = useCallback<SettingsLabel>(
    (zh, en) => language === 'zh' ? zh : en,
    [language],
  );

  const savePreference = useCallback<SaveSettingsPreference>(async (patch: SettingsPreferencePatch) => {
    try {
      const api = getApiFetch();
      if (!api) throw new Error('apiFetch unavailable');
      const result = await api('/api/users/me/preferences', { method: 'PATCH', body: patch });
      const user = getCurrentUser<{ preferences?: unknown }>();
      if (user) user.preferences = result.preferences;
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
