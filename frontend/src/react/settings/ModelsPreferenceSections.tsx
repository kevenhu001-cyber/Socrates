import { Input as ShadcnInput } from '../ui/shadcn/input';
import { PreferenceSelect } from './PreferenceSelect';
import { Button } from '../ui/shadcn/button';
import { Field, FieldLabel } from '../ui/shadcn/field';
import { useState } from 'react';
import { getCurrentUser } from '../legacy/gateway.ts';
import { confirmClearSettings } from '../../ui/dangerConfirms.js';
import type { SettingsLabel, SaveSettingsPreference } from './settings.types';
import { reportSwallow as reportEmptyCatch } from '../../util/reportSwallow.ts';

const SAVE_BTN_ID = 'saveSettingsBtn';

function readPreference(localKey: string, preferenceKey: string, fallback: string): string {
  try {
    const localValue = localStorage.getItem(localKey);
    if (localValue !== null) return localValue;
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: react/settings/ModelsPreferenceSections.tsx:read-local');
  }
  const preferences = getCurrentUser<{ preferences?: unknown }>()?.preferences;
  if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
    const value = (preferences as Record<string, unknown>)[preferenceKey];
    if (typeof value === 'string') return value;
  }
  return fallback;
}

export function ImageVoiceSettingsSection({
  label,
  savePreference,
}: {
  label: SettingsLabel;
  savePreference: SaveSettingsPreference;
}) {
  const [imageModel, setImageModel] = useState(() => readPreference('socrates-image-model', 'imageModel', ''));
  const [voiceLanguage, setVoiceLanguage] = useState(() => readPreference('socrates-voice-language', 'voiceLanguage', 'auto'));
  const updateImageModel = (value: string) => {
    setImageModel(value);
    try {
      localStorage.setItem('socrates-image-model', value);
    } catch (error) {
      reportEmptyCatch(error, 'empty catch: react/settings/ModelsPreferenceSections.tsx:38');
      // Private browsing can disable localStorage; preference sync remains available.
    }
  };
  const updateVoiceLanguage = (value: string) => {
    setVoiceLanguage(value);
    try {
      localStorage.setItem('socrates-voice-language', value);
    } catch (error) {
      reportEmptyCatch(error, 'empty catch: react/settings/ModelsPreferenceSections.tsx:46');
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
        <Field className="settings-image-model-field">
          <FieldLabel htmlFor="settings-image-model">{label('模型 ID', 'Model ID')}</FieldLabel>
          <div className="settings-inline-action">
            <ShadcnInput id="settings-image-model" value={imageModel} placeholder="gpt-image-1" onChange={(event) => updateImageModel(event.target.value)} />
            <Button variant="outline" onClick={() => void savePreference({ imageModel })}>{label('同步图片模型', 'Sync image model')}</Button>
          </div>
        </Field>
      </section>
      <section className="settings-section">
        <div className="settings-section-head"><h3>{label('语音输入语言', 'Voice input language')}</h3></div>
        <PreferenceSelect id="settings-voice-language" label={label('识别语言', 'Recognition language')} value={voiceLanguage}
          options={[{ value: 'auto', label: label('自动', 'Automatic') }, { value: 'zh-CN', label: '中文' }, { value: 'en-US', label: 'English' }]}
          onValueChange={updateVoiceLanguage} />
      </section>
    </>
  );
}

export function SettingsModelActions({
  label,
  saving,
  onSave,
}: {
  label: SettingsLabel;
  saving: boolean;
  onSave: () => void | Promise<void>;
}) {
  return (
    <div className="settings-actions settings-provider-actions">
      <Button variant="ghost" type="button" className="settings-clear-api" id="clearSettingsBtn" onClick={confirmClearSettings}>
        {label('清除 API 设置', 'Clear API settings')}
      </Button>
      <Button type="button" id={SAVE_BTN_ID} disabled={saving} onClick={() => void onSave()}>
        {saving ? label('正在保存…', 'Saving…') : label('保存服务商', 'Save providers')}
      </Button>
    </div>
  );
}
