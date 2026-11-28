import { Checkbox, Input as ShadcnInput, RadioGroup } from '../ui/v3';
import { Button } from '../ui/shadcn/button';
import { TrashIcon } from 'lucide-react';
import { Field, FieldGroup, FieldLabel } from '../ui/shadcn/field';
import { i18n } from '../../ui/legacyI18n.ts';
import { ProviderTextField } from './ProviderTextField';
import { PreferenceSelect } from './PreferenceSelect';
import { INSTANT_ENCODING_OPTIONS } from '../../config/providerConfig.types.ts';
import type { ProviderListProps, SettingsProviderErrors, SettingsProviderSnapshot } from './types';

interface ProviderRowProps {
  provider: SettingsProviderSnapshot;
  errors: SettingsProviderErrors[string];
  language: 'zh' | 'en';
  onFieldChange: ProviderListProps['onFieldChange'];
  onKeyRef: ProviderListProps['onKeyRef'];
  onLabelRef: ProviderListProps['onLabelRef'];
  onRemove: ProviderListProps['onRemove'];
}

function ProviderActiveButton({ active, id }: { active: boolean; id: string }) {
  const label = active
    ? i18n('settings.activeModel', 'Active model')
    : i18n('settings.setActiveModel', 'Set as active');
  return (
    <RadioGroup.Item className="provider-active-btn shrink-0" value={id}>
      {label}
    </RadioGroup.Item>
  );
}

function providerKeyPlaceholder(provider: SettingsProviderSnapshot): string {
  return provider.hasKey && !provider.id.startsWith('new-')
    ? '••••••••'
    : i18n('provider.placeholderKey', 'sk-...');
}

export function ProviderRow({
  provider,
  errors,
  language,
  onFieldChange,
  onKeyRef,
  onLabelRef,
  onRemove,
}: ProviderRowProps) {
  return (
    <div
      className={`provider-row flex flex-col gap-4 rounded-xl border border-border bg-transparent p-4${provider.isActive ? ' active' : ''}`}
      data-id={provider.id}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="text-sm font-medium text-foreground">
          {provider.label || i18n('provider.label', 'Display name')}
        </div>
        <ProviderActiveButton active={provider.isActive} id={provider.id} />
      </div>
      <div>
        <FieldGroup className="provider-fields">
          <ProviderTextField
            id={provider.id}
            field="label"
            label={i18n('provider.label', 'Display name')}
            placeholder={i18n('provider.placeholderLabel', 'Label')}
            value={provider.label}
            error={errors.label}
            inputRef={(element) => onLabelRef(provider.id, element)}
            onChange={(value) => onFieldChange(provider.id, 'label', value)}
          />
          <ProviderTextField
            id={provider.id}
            field="url"
            label={i18n('provider.url', 'Base URL')}
            placeholder={i18n('provider.placeholderUrl', 'Base URL')}
            value={provider.url}
            error={errors.url}
            onChange={(value) => onFieldChange(provider.id, 'url', value)}
          />
          <form style={{ display: 'contents' }} onSubmit={(event) => event.preventDefault()}>
            <ShadcnInput
              type="text"
              name="username"
              autoComplete="username"
              style={{ display: 'none' }}
              aria-hidden="true"
            />
            <ProviderTextField
              id={provider.id}
              field="key"
              label={i18n('provider.key', 'API key')}
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
            label={i18n('provider.model', 'Model ID')}
            placeholder={i18n('provider.placeholderModel', 'Model ID')}
            value={provider.model}
            onChange={(value) => onFieldChange(provider.id, 'model', value)}
          />
          <Field
            orientation="horizontal"
            className="provider-multimodal"
            title={i18n('provider.multimodalHint', 'Multimodal (vision-capable)')}
          >
            <Checkbox
              id={`provider-${provider.id}-vision`}
              data-field="vision"
              checked={provider.vision}
              onCheckedChange={(checked) => onFieldChange(provider.id, 'vision', checked)}
            />
            <FieldLabel htmlFor={`provider-${provider.id}-vision`}>
              {i18n('provider.multimodal', 'Multimodal (vision-capable)')}
            </FieldLabel>
          </Field>
          {/* the per-provider statement of
            how this endpoint encodes "no thinking". "Automatic" leaves the
            decision to the server's capability registry; the other values
            are the four encodings the server accepts. */}
          <PreferenceSelect
            id={`provider-${provider.id}-instant`}
            label={i18n('provider.instantEncoding', 'Instant encoding')}
            value={provider.instantEncoding ?? 'auto'}
            options={[
              { value: 'auto', label: i18n('provider.instantEncodingAuto', 'Automatic') },
              ...INSTANT_ENCODING_OPTIONS.map((encoding) => ({ value: encoding, label: encoding })),
            ]}
            onValueChange={(value) =>
              onFieldChange(provider.id, 'instantEncoding', value === 'auto' ? '' : value)
            }
          />
        </FieldGroup>
      </div>
      <div className="flex items-center justify-end border-t border-border/60 pt-3">
        <Button
          variant="destructive"
          type="button"
          className="provider-del"
          title={language === 'zh' ? '移除' : 'Remove'}
          aria-label={language === 'zh' ? '移除' : 'Remove'}
          onClick={() => onRemove(provider.id)}
        >
          <TrashIcon data-icon="inline-start" aria-hidden />
          {language === 'zh' ? '移除' : 'Remove'}
        </Button>
      </div>
    </div>
  );
}
