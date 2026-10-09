import type { SettingsPaneProps, SaveSettingsPreference, SettingsLanguage } from './settings.types';

export function GeneralSettingsPane({
  hidden,
  label,
  language,
  onLanguageChange,
  savePreference,
}: SettingsPaneProps & {
  language: SettingsLanguage;
  onLanguageChange: (language: string) => void;
  savePreference: SaveSettingsPreference;
}) {
  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('通用', 'General')}</h2>
      <label className="settings-choice">{label('外观', 'Appearance')}
        <select
          value={document.documentElement.getAttribute('data-theme-preference') || 'system'}
          onChange={(event) => {
            const theme = event.target.value;
            document.querySelector<HTMLElement>('[data-theme-option="' + theme + '"]')?.click();
            void savePreference({ theme });
          }}
        >
          <option value="system">{label('跟随系统', 'System')}</option>
          <option value="light">{label('浅色', 'Light')}</option>
          <option value="dark">{label('深色', 'Dark')}</option>
        </select>
      </label>
      <label className="settings-choice">{label('语言', 'Language')}
        <select value={language} onChange={(event) => onLanguageChange(event.target.value)}>
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </label>
    </section>
  );
}
