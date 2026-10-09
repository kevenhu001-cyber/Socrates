import { i18n } from '../legacy/gateway.ts';
import { ProviderList } from './ProviderList';
import { useProviderListState } from './useProviderListState';

const PROVIDER_LIST_ID = 'providerList';

export function ModelsProviderSection({
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
