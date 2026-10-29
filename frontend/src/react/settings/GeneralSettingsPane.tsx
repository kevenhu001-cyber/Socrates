import { useEffect, useState } from 'react';
import { FieldGroup } from '../ui/shadcn/field';
import { PreferenceSelect } from './PreferenceSelect';
import type { SettingsPaneProps, SaveSettingsPreference, SettingsLanguage } from './settings.types';

export function GeneralSettingsPane({ hidden, label, language, onLanguageChange, savePreference }: SettingsPaneProps & {
  language: SettingsLanguage;
  onLanguageChange: (language: string) => void;
  savePreference: SaveSettingsPreference;
}) {
  const [appearance, setAppearance] = useState(() => document.documentElement.getAttribute('data-theme-preference') || 'system');
  const [style, setStyle] = useState(() => document.documentElement.getAttribute('data-theme') || 'socrates');
  useEffect(() => {
    const syncTheme = () => {
      setAppearance(document.documentElement.getAttribute('data-theme-preference') || 'system');
      setStyle(document.documentElement.getAttribute('data-theme') || 'socrates');
    };
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-preference', 'data-theme'] });
    return () => observer.disconnect();
  }, []);
  return <section className="settings-pane" hidden={hidden}>
    <h2>{label('通用', 'General')}</h2>
    <FieldGroup className="settings-preference-fields">
      <PreferenceSelect id="settings-appearance" label={label('外观', 'Appearance')} value={appearance}
        options={[{ value: 'system', label: label('跟随系统', 'System') }, { value: 'light', label: label('浅色', 'Light') }, { value: 'dark', label: label('深色', 'Dark') }]}
        onValueChange={(theme) => {
          setAppearance(theme);
          document.querySelector<HTMLElement>('[data-theme-option="' + theme + '"]')?.click();
          void savePreference({ theme });
        }} />
      <PreferenceSelect id="settings-theme-style" label={label('主题风格', 'Theme style')} value={style}
        options={[{ value: 'socrates', label: label('Neutral 中性色', 'Neutral') }, { value: 'philosophy', label: label('Stone 石色', 'Stone') }]}
        onValueChange={(next) => {
          setStyle(next);
          document.querySelector<HTMLElement>('[data-theme-style-option="' + next + '"]')?.click();
        }} />
      <PreferenceSelect id="settings-language" label={label('语言', 'Language')} value={language}
        options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]} onValueChange={onLanguageChange} />
    </FieldGroup>
  </section>;
}
