import { AccountSettingsPane } from './AccountSettingsPane';
import { DisplaySettingsPane } from './DisplaySettingsPane';
import { GeneralSettingsPane } from './GeneralSettingsPane';
import { ModelsSettingsPane } from './ModelsSettingsPane';
import { PersonalizationSettingsPane } from './PersonalizationSettingsPane';
import {
  AppConnectionsSettingsPane,
  DataControlsSettingsPane,
  NotificationsSettingsPane,
} from './SettingsUtilityPanes';
import type { SaveSettingsPreference, SettingsLabel } from './settings.types';

interface SettingsPanesProps {
  section: string;
  language: 'zh' | 'en';
  externalApiOn: boolean;
  label: SettingsLabel;
  savePreference: SaveSettingsPreference;
  reportSaveError: (message: string) => void;
  onLanguageChange: (language: string) => void;
}

export function SettingsPanes({
  section,
  language,
  externalApiOn,
  label,
  savePreference,
  reportSaveError,
  onLanguageChange,
}: SettingsPanesProps) {
  const isHidden = (key: string) => section !== key;
  return (
    <>
      <GeneralSettingsPane
        hidden={isHidden('general')}
        label={label}
        language={language}
        onLanguageChange={onLanguageChange}
        savePreference={savePreference}
      />
      <DisplaySettingsPane hidden={isHidden('display')} label={label} />
      <NotificationsSettingsPane hidden={isHidden('notifications')} label={label} />
      <PersonalizationSettingsPane
        hidden={isHidden('personalization')}
        language={language}
        label={label}
        savePreference={savePreference}
        reportSaveError={reportSaveError}
      />
      <ModelsSettingsPane
        hidden={isHidden('models')}
        externalApiOn={externalApiOn}
        language={language}
        label={label}
        savePreference={savePreference}
      />
      <AppConnectionsSettingsPane hidden={isHidden('apps')} label={label} />
      <DataControlsSettingsPane hidden={isHidden('data')} label={label} />
      <AccountSettingsPane hidden={isHidden('account')} label={label} />
    </>
  );
}
