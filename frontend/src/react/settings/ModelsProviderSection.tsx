import { Button } from '../ui/shadcn/button';
import { ProviderList } from './ProviderList';
import { useProviderListState } from './useProviderListState';
import { SettingsModelActions } from './ModelsPreferenceSections';
import type { SettingsLabel } from './settings.types';
import { PlusIcon } from 'lucide-react';

const PROVIDER_LIST_ID = 'providerList';

export function ModelsProviderSection({
  externalApiOn,
  language,
  providers,
  providerErrors,
  providerState,
  label,
  saving,
  onSave,
}: {
  externalApiOn: boolean;
  language: 'zh' | 'en';
  providers: Parameters<typeof ProviderList>[0]['providers'];
  providerErrors: Parameters<typeof ProviderList>[0]['providerErrors'];
  providerState: ReturnType<typeof useProviderListState>;
  label: SettingsLabel;
  saving: boolean;
  onSave: () => void | Promise<void>;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-head settings-section-head--actions">
        <div>
          <h3>{label('模型服务商', 'Model providers')}</h3>
          <p>{label('添加服务商或选择当前使用的模型。', 'Add a provider or choose the active model.')}</p>
        </div>
        <Button variant="outline" id="addProviderBtn" type="button" onClick={() => void providerState.addProvider()}>
          <PlusIcon data-icon="inline-start" aria-hidden />
          {label('添加服务商', 'Add provider')}
        </Button>
      </div>
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
      <SettingsModelActions label={label} saving={saving} onSave={onSave} />
    </section>
  );
}
