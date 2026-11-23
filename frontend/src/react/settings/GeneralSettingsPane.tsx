import { useState } from 'react';
import { FieldGroup } from '../ui/shadcn/field';
import { PreferenceSelect } from './PreferenceSelect';
import { settingsPreferenceActions, useSettingsPreferencesStore } from './settings.store';
import {
  getReplyLanguage,
  setReplyLanguage,
  type ReplyLanguage,
} from '../../chat/replyLanguage.ts';
import type { SettingsPaneProps, SaveSettingsPreference, SettingsLanguage } from './settings.types';

/**
 * General: theme, theme style, interface language, and the answer-language
 * preference. All of it reads the settings store, so a value painted here is
 * the value the rest of the app is already showing (no DOM re-read, no
 * MutationObserver round trip).
 */
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
  const appearance = useSettingsPreferencesStore((state) => state.theme);
  const style = useSettingsPreferencesStore((state) => state.themeStyle);
  const [replyLanguage, setReplyLanguageState] = useState<ReplyLanguage>(getReplyLanguage);
  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('通用', 'General')}</h2>
      <section className="settings-section" aria-label={label('主题与语言', 'Theme & language')}>
        <FieldGroup className="settings-preference-fields">
          <PreferenceSelect
            id="settings-appearance"
            label={label('外观', 'Appearance')}
            value={appearance}
            options={[
              { value: 'system', label: label('跟随系统', 'System') },
              { value: 'light', label: label('浅色', 'Light') },
              { value: 'dark', label: label('深色', 'Dark') },
            ]}
            onValueChange={(theme) => {
              settingsPreferenceActions.setTheme(theme);
              void savePreference({ theme });
            }}
          />
          <PreferenceSelect
            id="settings-theme-style"
            label={label('主题风格', 'Theme style')}
            value={style}
            options={[
              { value: 'socrates', label: label('现代科技', 'Modern') },
              { value: 'philosophy', label: label('古典哲学', 'Philosophy') },
            ]}
            onValueChange={(next) => {
              settingsPreferenceActions.setThemeStyle(next);
            }}
          />
          <PreferenceSelect
            id="settings-language"
            label={label('语言', 'Language')}
            value={language}
            options={[
              { value: 'zh', label: '中文' },
              { value: 'en', label: 'English' },
            ]}
            onValueChange={onLanguageChange}
          />
          <PreferenceSelect
            id="settings-reply-language"
            label={label('回答语言', 'Answer language')}
            value={replyLanguage}
            options={[
              { value: 'auto', label: label('跟随输入', 'Match my writing') },
              { value: 'zh', label: '中文' },
              { value: 'en', label: 'English' },
            ]}
            onValueChange={(next) => {
              setReplyLanguageState(next as ReplyLanguage);
              setReplyLanguage(next as ReplyLanguage);
            }}
          />
        </FieldGroup>
      </section>
    </section>
  );
}
