import { Field, FieldGroup, FieldLabel } from '../ui/shadcn/field';
import { NativeSelect as ShadcnNativeSelect } from '../ui/shadcn/native-select';
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
      <FieldGroup className="settings-preference-fields">
      <Field orientation="horizontal" className="settings-choice"><FieldLabel htmlFor="settings-appearance">{label('外观', 'Appearance')}</FieldLabel>
        <ShadcnNativeSelect
          id="settings-appearance"
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
        </ShadcnNativeSelect>
      </Field>
      <Field orientation="horizontal" className="settings-choice"><FieldLabel htmlFor="settings-theme-style">{label('主题风格', 'Theme style')}</FieldLabel>
        <ShadcnNativeSelect
          id="settings-theme-style"
          value={document.documentElement.getAttribute('data-theme') || 'socrates'}
          onChange={(event) => {
            const style = event.target.value;
            document.querySelector<HTMLElement>('[data-theme-style-option="' + style + '"]')?.click();
          }}
        >
          <option value="socrates">{label('现代科技', 'Modern')}</option>
          <option value="philosophy">{label('古典哲学', 'Philosophy')}</option>
        </ShadcnNativeSelect>
      </Field>
      <Field orientation="horizontal" className="settings-choice"><FieldLabel htmlFor="settings-language">{label('语言', 'Language')}</FieldLabel>
        <ShadcnNativeSelect id="settings-language" value={language} onChange={(event) => onLanguageChange(event.target.value)}>
          <option value="zh">中文</option>
          <option value="en">English</option>
        </ShadcnNativeSelect>
      </Field>
      </FieldGroup>
    </section>
  );
}
