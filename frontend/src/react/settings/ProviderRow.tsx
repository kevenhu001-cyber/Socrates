import { i18n } from '../legacy/gateway.ts';
import { ProviderTextField } from './ProviderTextField';
import type { ProviderListProps, SettingsProviderErrors, SettingsProviderSnapshot } from './types';

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

function ProviderActiveButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const label = active ? i18n('settings.activeModel', 'Active model') : i18n('settings.setActiveModel', 'Set as active');
  return (
    <button type="button" className="provider-active-btn" title={label} aria-label={label} aria-pressed={active} onClick={onClick}>
      {active ? '●' : '○'}
    </button>
  );
}

function providerKeyPlaceholder(provider: SettingsProviderSnapshot): string {
  return provider.hasKey && !provider.id.startsWith('new-') ? '••••••••' : i18n('provider.placeholderKey', 'sk-...');
}

export function ProviderRow({
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
    <div className={`provider-row${provider.isActive ? ' active' : ''}`} data-id={provider.id}>
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
