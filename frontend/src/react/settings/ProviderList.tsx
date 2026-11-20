import { useLayoutEffect, useRef, useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { Button } from '../ui/shadcn/button';
import { RadioGroup, RadioGroupItem } from '../ui/shadcn/radio-group';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from '../ui/shadcn/card';
import { Badge } from '../ui/shadcn/badge';
import { i18n } from '../legacy/gateway.ts';
import { ProviderRow } from './ProviderRow';
import type { ProviderListProps, SettingsProviderSnapshot } from './types';

function initialProviderId(providers: SettingsProviderSnapshot[]): string | null {
  return providers.find((provider) => provider.isActive)?.id ?? providers[0]?.id ?? null;
}

/**
 * ZCode-style provider navigator: choosing which form to edit is independent
 * of activating that provider for chat. Keep every form mounted (but hide all
 * except the selected one) so unsaved API keys and drafts survive navigation.
 */
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
  const [selectedId, setSelectedId] = useState<string | null>(() => initialProviderId(providers));
  const previousIds = useRef(new Set(providers.map((provider) => provider.id)));

  useLayoutEffect(() => {
    const ids = new Set(providers.map((provider) => provider.id));
    const addedDrafts = providers.filter(
      (provider) => provider.id.startsWith('new-') && !previousIds.current.has(provider.id),
    );
    previousIds.current = ids;
    setSelectedId((current) => {
      if (addedDrafts.length > 0) return addedDrafts[addedDrafts.length - 1].id;
      if (current && ids.has(current)) return current;
      return initialProviderId(providers);
    });
  }, [providers]);

  const activeId = providers.find((provider) => provider.isActive)?.id ?? null;
  const customProviders = providers.filter((provider) => !provider.isBuiltIn);
  const builtIn = providers.find((provider) => provider.isBuiltIn);

  return (
    <div
      className={`provider-list ui-collapse${externalApiOn ? '' : ' collapsed'}`}
      id={id}
    >
      <div className="ui-collapse-inner">
        <div className="provider-workbench">
          <nav
            className="provider-workbench-nav"
            aria-label={i18n('settings.models', 'Models')}
          >
            {providers.map((provider) => (
              <Button
                key={provider.id}
                type="button"
                variant="ghost"
                className={`provider-nav-item${selectedId === provider.id ? ' selected' : ''}`}
                data-provider-id={provider.id}
                aria-pressed={selectedId === provider.id}
                aria-controls={`provider-editor-${provider.id}`}
                onClick={() => setSelectedId(provider.id)}
              >
                <span className="provider-nav-name">
                  {provider.label || provider.model || i18n('provider.label', 'Display name')}
                </span>
                {provider.id === activeId ? (
                  <CheckIcon
                    className="provider-nav-active"
                    aria-label={i18n('settings.activeModel', 'Active model')}
                  />
                ) : null}
                {Object.keys(providerErrors[provider.id] || {}).length > 0 ? (
                  <span
                    className="provider-nav-error"
                    aria-label={language === 'zh' ? '配置存在错误' : 'Configuration error'}
                  />
                ) : null}
              </Button>
            ))}
          </nav>
          <RadioGroup
            className="provider-workbench-detail"
            aria-label={i18n('settings.models', 'Models')}
            value={activeId}
            onValueChange={(next) => {
              if (typeof next === 'string') onSetActive(next);
            }}
          >
            {customProviders.map((provider) => (
              <div
                key={provider.id}
                id={`provider-editor-${provider.id}`}
                className="provider-editor"
                hidden={selectedId !== provider.id}
              >
                <ProviderRow
                  provider={provider}
                  errors={providerErrors[provider.id] || {}}
                  language={language}
                  onFieldChange={onFieldChange}
                  onKeyRef={onKeyRef}
                  onLabelRef={onLabelRef}
                  onRemove={onRemove}
                />
              </div>
            ))}
            {builtIn ? (
              <div
                id={`provider-editor-${builtIn.id}`}
                className="provider-editor"
                hidden={selectedId !== builtIn.id}
              >
                <Card
                  className={`provider-row built-in-row${builtIn.isActive ? ' active' : ''}`}
                  data-id={builtIn.id}
                >
                  <CardHeader>
                    <CardTitle>{builtIn.label || builtIn.model || 'Built-in AI'}</CardTitle>
                    <CardDescription>{builtIn.model}</CardDescription>
                    <CardAction>
                      <RadioGroupItem
                        value={builtIn.id}
                        className="provider-active-btn"
                        title={
                          builtIn.isActive
                            ? i18n('settings.activeModel', 'Active model')
                            : i18n('settings.setActiveModel', 'Set as active')
                        }
                        aria-label={
                          builtIn.isActive
                            ? i18n('settings.activeModel', 'Active model')
                            : i18n('settings.setActiveModel', 'Set as active')
                        }
                      />
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    {builtIn.isActive ? (
                      <Badge variant="secondary">
                        {i18n('settings.builtInTag', 'Built-in · Active')}
                      </Badge>
                    ) : null}
                  </CardContent>
                </Card>
                {customProviders.length === 0 ? (
                  <div className="provider-empty">
                    {i18n('settings.noCustomProviders', 'No custom providers yet.')}
                  </div>
                ) : null}
              </div>
            ) : null}
            {providers.length === 0 ? (
              <div className="provider-empty">
                {i18n('settings.noProviders', 'No providers configured yet.')}
              </div>
            ) : null}
          </RadioGroup>
        </div>
      </div>
    </div>
  );
}
