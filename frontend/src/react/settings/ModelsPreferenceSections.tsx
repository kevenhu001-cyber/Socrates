import { useState } from 'react';
import { i18n } from '../legacy/gateway.ts';
import { confirmClearSettings } from '../../ui/dangerConfirms.js';
import { closeSettings } from './settings.service';
import type { SettingsLabel, SaveSettingsPreference } from './settings.types';

const SAVE_BTN_ID = 'saveSettingsBtn';

export function ImageVoiceSettingsSection({
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

export function SettingsModelActions({
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
