import { useState } from 'react';
import { FieldGroup } from '../ui/shadcn/field';
import { Label } from '../ui/shadcn/label';
import { Switch } from '../ui/shadcn/switch';
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
  const showMath = useSettingsPreferencesStore((state) => state.showMath);
  const mathLabel = label('显示数学公式', 'Show math formulas');
  const [replyLanguage, setReplyLanguageState] = useState<ReplyLanguage>(getReplyLanguage);
  return (
    <section className="settings-pane settings-general" hidden={hidden}>
      <h2>{label('常规', 'General')}</h2>
      <FieldGroup className="settings-preference-fields">
        <PreferenceSelect
          id="settings-appearance"
          label={label('主题', 'Theme')}
          value={appearance}
          options={[
            { value: 'system', label: label('系统', 'System') },
            { value: 'light', label: label('浅色', 'Light') },
            { value: 'dark', label: label('深色', 'Dark') },
          ]}
          onValueChange={(theme) => {
            settingsPreferenceActions.setTheme(theme);
            void savePreference({ theme });
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
        <div className="settings-choice settings-choice--switch">
          <Label htmlFor="settings-show-math">{mathLabel}</Label>
          <Switch
            id="settings-show-math"
            className="settings-math-switch"
            aria-label={mathLabel}
            checked={showMath}
            onCheckedChange={settingsPreferenceActions.setShowMath}
          />
        </div>
      </FieldGroup>
      <details className="settings-general-more">
        <summary>{label('更多外观与语言选项', 'More appearance and language options')}</summary>
        <FieldGroup className="settings-preference-fields">
          <PreferenceSelect
            id="settings-theme-style"
            label={label('主题风格', 'Theme style')}
            value={style}
            options={[
              { value: 'socrates', label: label('现代科技', 'Modern') },
              { value: 'philosophy', label: label('古典哲学', 'Philosophy') },
            ]}
            onValueChange={settingsPreferenceActions.setThemeStyle}
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
      </details>
    </section>
  );
}
