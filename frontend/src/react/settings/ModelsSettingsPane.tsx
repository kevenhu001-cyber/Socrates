import { i18n } from '../legacy/gateway.ts';
import { useProviderListState } from './useProviderListState';
import { useProviderConfigStore } from '../../config/providerConfig.store';
import { toggleExternalApi } from './settings.service';
import { ModelsProviderSection } from './ModelsProviderSection';
import { ImageVoiceSettingsSection, SettingsModelActions } from './ModelsPreferenceSections';
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
      <div className="settings-hero">
        <div>
          <h2 className="settings-hero-title">{label('模型与语音', 'Models & voice')}</h2>
          <p className="settings-hero-subtitle">{label(
            '配置对话和图片模型。语音输入使用浏览器麦克风。',
            'Configure chat and image models. Voice input uses your browser microphone.',
          )}</p>
        </div>
      </div>
      <section className="settings-section">
        <div className="settings-section-head">
          <h3>Connection</h3>
          <p>Choose whether Socrates may use your own API credentials.</p>
        </div>
        <div className="settings-card settings-card--toggle">
          <div className="stg-toggle" id="stgToggle" onClick={toggleExternalApi}>
            <span className="settings-label stg-toggle-label">{i18n('settings.useExternalApi', 'Use External API')}</span>
            <div className={'stg-toggle-track' + (externalApiOn ? ' on' : '')} id={TRACK_ID}>
              <div className="stg-toggle-knob" />
            </div>
          </div>
        </div>
      </section>
      <ModelsProviderSection
        externalApiOn={externalApiOn}
        language={language}
        providers={providers}
        providerErrors={providerConfig.errors}
        providerState={providerState}
      />
      <div id="stgStatus" />
      <ImageVoiceSettingsSection label={label} savePreference={savePreference} />
      <SettingsModelActions saving={providerConfig.saving} onSave={providerState.saveProviders} />
    </div>
  );
}
