export type SettingsLanguage = 'zh' | 'en';
export type SettingsLabel = (zh: string, en: string) => string;
export type SettingsPreferencePatch = Record<string, unknown>;
export type SaveSettingsPreference = (patch: SettingsPreferencePatch) => Promise<void>;
export interface SettingsMemory { id: string; key: string; value: string }

export interface SettingsPaneProps {
  hidden: boolean;
  label: SettingsLabel;
}
