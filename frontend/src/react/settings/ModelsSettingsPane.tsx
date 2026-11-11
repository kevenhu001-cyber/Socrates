import { Switch } from '../ui/shadcn/switch';
import { Field, FieldLabel } from '../ui/shadcn/field';
import { useProviderListState } from './useProviderListState';
import { useProviderConfigStore } from '../../config/providerConfig.store';
import { toggleExternalApi } from './settings.service';
import { ModelsProviderSection } from './ModelsProviderSection';
import { ImageVoiceSettingsSection } from './ModelsPreferenceSections';
import type { SettingsLabel, SaveSettingsPreference } from './settings.types';

interface ModelsSettingsPaneProps {
  hidden: boolean;
  externalApiOn: boolean;
  language: 'zh' | 'en';
  label: SettingsLabel;
  savePreference: SaveSettingsPreference;
}

const TRACK_ID = 'stgToggleTrack';

export function ModelsSettingsPane({
  hidden,
  externalApiOn,
  language,
  label,
  savePreference,
}: ModelsSettingsPaneProps) {
  const providerConfig = useProviderConfigStore((state) => state);
  const providerState = useProviderListState();
  const providers = providerConfig.providers.map((provider) => ({
    ...provider,
    isActive: provider.id === providerConfig.activeId || (!providerConfig.activeId && provider.isBuiltIn),
  }));
  return (
    <div className="settings-pane" hidden={hidden}>
      <h2>{label('模型与语音', 'Models & voice')}</h2>
      <p>{label(
          '配置对话和图片模型。语音输入使用浏览器麦克风。',
          'Configure chat and image models. Voice input uses your browser microphone.',
        )}</p>
      <section className="settings-section">
        <div className="settings-section-head">
          <h3>{label('连接方式', 'Connection')}</h3>
          <p>{label('选择 Socrates 是否可以使用你自己的 API 凭据。', 'Choose whether Socrates may use your own API credentials.')}</p>
        </div>
        <div className="settings-card settings-card--toggle">
          <Field orientation="horizontal">
            <FieldLabel id="stgToggle" htmlFor={TRACK_ID} className="flex-1">{label('使用外部 API', 'Use External API')}</FieldLabel>
            <Switch id={TRACK_ID} aria-labelledby="stgToggle" checked={externalApiOn} onCheckedChange={toggleExternalApi} />
          </Field>
        </div>
      </section>
      <ModelsProviderSection
        externalApiOn={externalApiOn}
        language={language}
        providers={providers}
        providerErrors={providerConfig.errors}
        providerState={providerState}
        label={label}
        saving={providerConfig.saving}
        onSave={providerState.saveProviders}
      />
      <div id="stgStatus" />
      <ImageVoiceSettingsSection label={label} savePreference={savePreference} />
    </div>
  );
}
