import { RadioGroup, RadioGroupItem } from '../ui/shadcn/radio-group';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from '../ui/shadcn/card';
import { Badge } from '../ui/shadcn/badge';
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
    <RadioGroup className={`provider-list ui-collapse${externalApiOn ? '' : ' collapsed'}`} id={id}
      aria-label={i18n('settings.models', 'Models')} value={providers.find((provider) => provider.isActive)?.id || null}
      onValueChange={(next) => { if (typeof next === 'string') onSetActive(next); }}>
      <div className="ui-collapse-inner">
        {customProviders.length > 0 ? customProviders.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            errors={providerErrors[provider.id] || {}}
            language={language}
            onFieldChange={onFieldChange}
            onKeyRef={onKeyRef}
            onLabelRef={onLabelRef}
            onRemove={onRemove}
          />
        )) : builtIn ? (
          <>
            <Card className={`provider-row built-in-row${builtIn.isActive ? ' active' : ''}`} data-id={builtIn.id}>
              <CardHeader><CardTitle>{builtIn.label || builtIn.model || 'Built-in AI'}</CardTitle>
              <CardDescription>{builtIn.model}</CardDescription><CardAction>
              <RadioGroupItem
                value={builtIn.id}
                className="provider-active-btn"
                title={builtIn.isActive ? i18n('settings.activeModel', 'Active model') : i18n('settings.setActiveModel', 'Set as active')}
                aria-label={builtIn.isActive ? i18n('settings.activeModel', 'Active model') : i18n('settings.setActiveModel', 'Set as active')}
              />
              </CardAction></CardHeader>
              <CardContent>{builtIn.isActive ? <Badge variant="secondary">{i18n('settings.builtInTag', 'Built-in · Active')}</Badge> : null}
                <p>{i18n('settings.builtInHint', 'Your built-in AI is ready to use. Add a custom provider below if you want to use your own API key.')}</p>
              </CardContent>
            </Card>
            <div className="provider-empty">{i18n('settings.noCustomProviders', 'No custom providers. Click “+ Add” to use your own API key.')}</div>
          </>
        ) : (
          <div className="provider-empty">{language === 'zh' ? '还没有模型。点击“+ Add”配置第一个模型。' : 'No models yet. Click “+ Add” to configure your first one.'}</div>
        )}
      </div>
    </RadioGroup>
  );
}
