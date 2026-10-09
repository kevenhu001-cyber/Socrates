import { i18n } from '../legacy/gateway.ts';
import { ProviderRow } from './ProviderRow';
import type { ProviderListProps } from './types';

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
