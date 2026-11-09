import { Button } from '../ui/shadcn/button';
import { ProviderList } from './ProviderList';
import { useProviderListState } from './useProviderListState';
import type { SettingsLabel } from './settings.types';

const PROVIDER_LIST_ID = 'providerList';

export function ModelsProviderSection({
  externalApiOn,
  language,
  providers,
  providerErrors,
  providerState,
  label,
}: {
  externalApiOn: boolean;
  language: 'zh' | 'en';
  providers: Parameters<typeof ProviderList>[0]['providers'];
  providerErrors: Parameters<typeof ProviderList>[0]['providerErrors'];
  providerState: ReturnType<typeof useProviderListState>;
  label: SettingsLabel;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <h3>{label('模型服务商', 'Model providers')}</h3>
        <p>{label('添加服务商或选择当前使用的模型。', 'Add a provider or choose the active model.')}</p>
      </div>
      <div className="settings-field">
        <div className="settings-label-row">
          <span className="settings-label">{label('模型', 'Models')}</span>
          <Button variant="default" id="addProviderBtn" type="button" onClick={() => void providerState.addProvider()}>
            {label('添加服务商', '+ Add provider')}
          </Button>
        </div>
        <span className="settings-hint">
          {label('配置一个或多个服务商，选择圆形按钮可设为当前使用项。', 'Configure providers, then select the circle to choose the active one.')}
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
