import { useRef } from 'react';
import { i18n } from '../legacy/gateway.ts';
import {
  addProvider as addProviderConfig,
  removeProvider as removeProviderConfig,
  saveProviderConfig,
  setActiveProvider,
  updateProviderField,
} from '../../config/providerConfig.service';
import type {
  SettingsProviderErrors,
  SettingsProviderField,
  SettingsProviderSnapshot,
} from './types';

interface ProviderListProps {
  id: string;
  providers: SettingsProviderSnapshot[];
  providerErrors: SettingsProviderErrors;
  externalApiOn: boolean;
  language: 'zh' | 'en';
  onFieldChange: (id: string, field: SettingsProviderField, value: string | boolean) => void;
  onKeyRef: (id: string, element: HTMLInputElement | null) => void;
  onLabelRef: (id: string, element: HTMLInputElement | null) => void;
  onSetActive: (id: string) => void;
  onRemove: (id: string) => void;
}

interface ProviderListState {
  onFieldChange: ProviderListProps['onFieldChange'];
  onKeyRef: ProviderListProps['onKeyRef'];
  onLabelRef: ProviderListProps['onLabelRef'];
  onSetActive: ProviderListProps['onSetActive'];
  onRemove: ProviderListProps['onRemove'];
  addProvider: () => Promise<void>;
  saveProviders: () => Promise<void>;
}

export function useProviderListState(): ProviderListState {
  const labelRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const keyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const onFieldChange: ProviderListState['onFieldChange'] = updateProviderField;
  const onLabelRef = (id: string, element: HTMLInputElement | null) => {
    labelRefs.current[id] = element;
  };
  const onKeyRef = (id: string, element: HTMLInputElement | null) => {
    keyRefs.current[id] = element;
  };
  const onSetActive = (id: string) => { void setActiveProvider(id); };
  const onRemove = async (id: string) => {
    await removeProviderConfig(id);
  };
  const addProvider = async () => {
    const id = addProviderConfig();
    if (id) requestAnimationFrame(() => labelRefs.current[id]?.focus());
  };
  const saveProviders = async () => {
    const result = await saveProviderConfig();
    result.savedIds.forEach((id) => {
      if (keyRefs.current[id]) keyRefs.current[id]!.value = '';
    });
  };

  return { onFieldChange, onLabelRef, onKeyRef, onSetActive, onRemove, addProvider, saveProviders };
}

interface ProviderRowProps {
  provider: SettingsProviderSnapshot;
  errors: SettingsProviderErrors[string];
  language: 'zh' | 'en';
  onFieldChange: ProviderListProps['onFieldChange'];
  onKeyRef: ProviderListProps['onKeyRef'];
  onLabelRef: ProviderListProps['onLabelRef'];
  onSetActive: ProviderListProps['onSetActive'];
  onRemove: ProviderListProps['onRemove'];
}

interface ProviderTextFieldProps {
  id: string;
  field: 'label' | 'url' | 'key' | 'model';
  label: string;
  placeholder: string;
  value?: string;
  defaultValue?: string;
  error?: string;
  type?: 'text' | 'password';
  autoComplete?: string;
  inputRef?: (element: HTMLInputElement | null) => void;
  onChange: (value: string) => void;
}

function ProviderTextField({
  id,
  field,
  label,
  placeholder,
  value,
  error,
  type = 'text',
  autoComplete,
  inputRef,
  onChange,
  defaultValue,
}: ProviderTextFieldProps) {
  const descriptionId = `provider-${id}-${field}-error`;
  return (
    <>
      <input
        ref={inputRef}
        className="settings-input"
        data-field={field}
        type={type}
        autoComplete={autoComplete}
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? descriptionId : undefined}
        placeholder={placeholder}
        {...(value === undefined ? { defaultValue } : { value })}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <span id={descriptionId} className="settings-field-error" role="alert">{error}</span> : null}
    </>
  );
}

function ProviderActiveButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const label = active ? i18n('settings.activeModel', 'Active model') : i18n('settings.setActiveModel', 'Set as active');
  return (
    <button type="button" className="provider-active-btn" title={label} aria-label={label} aria-pressed={active} onClick={onClick}>
      {active ? '●' : '○'}
    </button>
  );
}

function ProviderRowClass(active: boolean): string {
  return active ? 'provider-row active' : 'provider-row';
}

function providerKeyPlaceholder(provider: SettingsProviderSnapshot): string {
  return provider.hasKey && !provider.id.startsWith('new-') ? '••••••••' : i18n('provider.placeholderKey', 'sk-...');
}

function ProviderRow({
  provider,
  errors,
  language,
  onFieldChange,
  onKeyRef,
  onLabelRef,
  onSetActive,
  onRemove,
}: ProviderRowProps) {
  return (
    <div className={ProviderRowClass(provider.isActive)} data-id={provider.id}>
      <ProviderActiveButton active={provider.isActive} onClick={() => onSetActive(provider.id)} />
      <div className="provider-fields">
        <ProviderTextField
          id={provider.id}
          field="label"
          label={i18n('provider.placeholderLabel', 'Label')}
          placeholder={i18n('provider.placeholderLabel', 'Label')}
          value={provider.label}
          error={errors.label}
          inputRef={(element) => onLabelRef(provider.id, element)}
          onChange={(value) => onFieldChange(provider.id, 'label', value)}
        />
        <ProviderTextField
          id={provider.id}
          field="url"
          label={i18n('provider.placeholderUrl', 'Base URL')}
          placeholder={i18n('provider.placeholderUrl', 'Base URL')}
          value={provider.url}
          error={errors.url}
          onChange={(value) => onFieldChange(provider.id, 'url', value)}
        />
        <form style={{ display: 'contents' }} onSubmit={(event) => event.preventDefault()}>
          <input type="text" name="username" autoComplete="username" style={{ display: 'none' }} aria-hidden="true" />
          <ProviderTextField
            id={provider.id}
            field="key"
            label={i18n('provider.placeholderKey', 'API key')}
            placeholder={providerKeyPlaceholder(provider)}
            defaultValue=""
            error={errors.key}
            type="password"
            autoComplete="new-password"
            inputRef={(element) => onKeyRef(provider.id, element)}
            onChange={(value) => onFieldChange(provider.id, 'key', value)}
          />
        </form>
        <ProviderTextField
          id={provider.id}
          field="model"
          label={i18n('provider.placeholderModel', 'Model ID')}
          placeholder={i18n('provider.placeholderModel', 'Model ID')}
          value={provider.model}
          onChange={(value) => onFieldChange(provider.id, 'model', value)}
        />
        <label className="provider-multimodal" title={i18n('provider.multimodalHint', 'Multimodal (vision-capable)')}>
          <input
            type="checkbox"
            data-field="vision"
            checked={provider.vision}
            onChange={(event) => onFieldChange(provider.id, 'vision', event.target.checked)}
          />
          <span>{i18n('provider.multimodal', 'Multimodal (vision-capable)')}</span>
        </label>
      </div>
      <button type="button" className="provider-del" title={language === 'zh' ? '移除' : 'Remove'} aria-label={language === 'zh' ? '移除' : 'Remove'} onClick={() => onRemove(provider.id)}>
        ×
      </button>
    </div>
  );
}

export function ProviderList({
  id,
  providers,
  providerErrors,
  externalApiOn,
  language,
  onFieldChange,
  onKeyRef,
  onLabelRef,
  onSetActive,
  onRemove,
}: ProviderListProps) {
  const customProviders = providers.filter((provider) => !provider.isBuiltIn);
  const builtIn = providers.find((provider) => provider.isBuiltIn);

  return (
    <div className={`provider-list${externalApiOn ? '' : ' collapsed'}`} id={id}>
      {customProviders.length > 0 ? customProviders.map((provider) => (
        <ProviderRow
          key={provider.id}
          provider={provider}
          errors={providerErrors[provider.id] || {}}
          language={language}
          onFieldChange={onFieldChange}
          onKeyRef={onKeyRef}
          onLabelRef={onLabelRef}
          onSetActive={onSetActive}
          onRemove={onRemove}
        />
      )) : builtIn ? (
        <>
          <div className={`provider-row built-in-row${builtIn.isActive ? ' active' : ''}`} data-id={builtIn.id}>
            <button
              type="button"
              className="provider-active-btn"
              title={builtIn.isActive ? i18n('settings.activeModel', 'Active model') : i18n('settings.setActiveModel', 'Set as active')}
              aria-label={builtIn.isActive ? i18n('settings.activeModel', 'Active model') : i18n('settings.setActiveModel', 'Set as active')}
              aria-pressed={builtIn.isActive}
              onClick={() => onSetActive(builtIn.id)}
            >
              {builtIn.isActive ? '●' : '○'}
            </button>
            <div className="provider-fields">
              <div className="provider-builtin-label">
                {builtIn.label || builtIn.model || 'Built-in AI'}
                {builtIn.isActive ? <span className="provider-builtin-tag">{i18n('settings.builtInTag', 'Built-in · Active')}</span> : null}
              </div>
              <div className="provider-builtin-model">{builtIn.model}</div>
              <div className="provider-builtin-hint">{i18n('settings.builtInHint', 'Your built-in AI is ready to use. Add a custom provider below if you want to use your own API key.')}</div>
            </div>
          </div>
          <div className="provider-empty">{i18n('settings.noCustomProviders', 'No custom providers. Click “+ Add” to use your own API key.')}</div>
        </>
      ) : (
        <div className="provider-empty">{language === 'zh' ? '还没有模型。点击“+ Add”配置第一个模型。' : 'No models yet. Click “+ Add” to configure your first one.'}</div>
      )}
    </div>
  );
}
