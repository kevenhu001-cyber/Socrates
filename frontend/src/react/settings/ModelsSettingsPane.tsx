import { useState } from 'react';
import { i18n } from '../legacy/gateway.ts';
import { ProviderList } from './ProviderList';
import { useProviderListState } from './useProviderListState';
import { useProviderConfigStore } from '../../config/providerConfig.store';
import { confirmClearSettings } from '../../ui/dangerConfirms.js';
import { closeSettings, toggleExternalApi } from './settings.service';
import type { SettingsLabel, SaveSettingsPreference } from './settings.types';

interface ModelsSettingsPaneProps {
  hidden: boolean;
  externalApiOn: boolean;
  language: 'zh' | 'en';
  label: SettingsLabel;
  savePreference: SaveSettingsPreference;
}

const PROVIDER_LIST_ID = 'providerList';
const TRACK_ID = 'stgToggleTrack';
const SAVE_BTN_ID = 'saveSettingsBtn';

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
      <ProviderSettingsSection
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

function ProviderSettingsSection({
  externalApiOn,
  language,
  providers,
  providerErrors,
  providerState,
}: {
  externalApiOn: boolean;
  language: 'zh' | 'en';
  providers: Parameters<typeof ProviderList>[0]['providers'];
  providerErrors: Parameters<typeof ProviderList>[0]['providerErrors'];
  providerState: ReturnType<typeof useProviderListState>;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <h3>Model providers</h3>
        <p>Add a provider or choose the active model.</p>
      </div>
      <div className="settings-field">
        <div className="settings-label-row">
          <span className="settings-label">{i18n('settings.models', 'Models')}</span>
          <button className="settings-btn-mini" id="addProviderBtn" type="button" onClick={() => void providerState.addProvider()}>
            {i18n('settings.addProvider', '+ Add')}
          </button>
        </div>
        <span className="settings-hint">
          {i18n('settings.providerHint', 'Configure one or more providers. Click the circle to set one as active.')}
        </span>
        <ProviderList
          id={PROVIDER_LIST_ID}
          providers={providers}
          providerErrors={providerErrors}
          externalApiOn={externalApiOn}
          language={language}
          onFieldChange={providerState.onFieldChange}
          onKeyRef={providerState.onKeyRef}
          onLabelRef={providerState.onLabelRef}
          onSetActive={providerState.onSetActive}
          onRemove={providerState.onRemove}
        />
      </div>
    </section>
  );
}

function ImageVoiceSettingsSection({
  label,
  savePreference,
}: {
  label: SettingsLabel;
  savePreference: SaveSettingsPreference;
}) {
  const [imageModel, setImageModel] = useState(() => {
    try {
      return localStorage.getItem('socrates-image-model') || '';
    } catch {
      return '';
    }
  });
  const [voiceLanguage, setVoiceLanguage] = useState(() => {
    try {
      return localStorage.getItem('socrates-voice-language') || 'auto';
    } catch {
      return 'auto';
    }
  });
  const updateImageModel = (value: string) => {
    setImageModel(value);
    try {
      localStorage.setItem('socrates-image-model', value);
    } catch {
      // Private browsing can disable localStorage; preference sync remains available.
    }
  };
  const updateVoiceLanguage = (value: string) => {
    setVoiceLanguage(value);
    try {
      localStorage.setItem('socrates-voice-language', value);
    } catch {
      // Private browsing can disable localStorage; preference sync remains available.
    }
    void savePreference({ voiceLanguage: value });
  };

  return (
    <>
      <section className="settings-section">
        <div className="settings-section-head">
          <h3>{label('图片模型', 'Image model')}</h3>
          <p>{label('填写当前图片服务支持的模型 ID。', 'Enter the model ID supported by your image provider.')}</p>
        </div>
        <div className="settings-field">
          <input className="settings-input" value={imageModel} placeholder="gpt-image-1" onChange={(event) => updateImageModel(event.target.value)} />
          <button className="settings-btn secondary" onClick={() => void savePreference({ imageModel })}>{label('同步图片模型', 'Sync image model')}</button>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-section-head"><h3>{label('语音输入语言', 'Voice input language')}</h3></div>
        <label className="settings-choice">{label('识别语言', 'Recognition language')}
          <select value={voiceLanguage} onChange={(event) => updateVoiceLanguage(event.target.value)}>
            <option value="auto">{label('自动', 'Automatic')}</option>
            <option value="zh-CN">中文</option>
            <option value="en-US">English</option>
          </select>
        </label>
      </section>
    </>
  );
}

function SettingsModelActions({
  saving,
  onSave,
}: {
  saving: boolean;
  onSave: () => void | Promise<void>;
}) {
  return (
    <div className="settings-actions">
      <button className="settings-btn danger" id="clearSettingsBtn" onClick={confirmClearSettings}>
        {i18n('settings.clearAll', 'Clear all')}
      </button>
      <button className="settings-btn secondary" id="cancelSettingsBtn" onClick={closeSettings}>
        {i18n('common.cancel', 'Cancel')}
      </button>
      <button className="settings-btn primary" id={SAVE_BTN_ID} disabled={saving} onClick={() => void onSave()}>
        {saving ? i18n('settings.saving', 'Saving…') : i18n('settings.save', 'Save')}
      </button>
    </div>
  );
}
