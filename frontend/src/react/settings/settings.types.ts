export const SETTINGS_SECTIONS = ['general', 'display', 'notifications', 'personalization', 'models', 'apps', 'data', 'account'] as const;
export type SettingsSection = typeof SETTINGS_SECTIONS[number];
export type SettingsLanguage = 'zh' | 'en';
export type SettingsLabel = (zh: string, en: string) => string;
export type SettingsPreferencePatch = Record<string, unknown>;
export type SaveSettingsPreference = (patch: SettingsPreferencePatch) => Promise<void>;
export interface SettingsMemory { id: string; key: string; value: string }

export interface SettingsPaneProps {
  hidden: boolean;
  label: SettingsLabel;
}
