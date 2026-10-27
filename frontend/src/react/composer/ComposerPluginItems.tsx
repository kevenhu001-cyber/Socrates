import { Button } from '../ui/Button';
import { Icon } from '../../ui/Icon';
import { useEffect, useMemo, useRef, useState } from 'react';

import { i18n } from './composerToolsMenuData';
import type { ComposerToolsAction } from './types';
import { loadPluginCatalog, type PluginCatalogEntry } from '../../composer/pluginCatalog.ts';
import { getConnectorIconMarkupFn } from '../legacy/gateway.ts';
import { useComposerPluginSelectionSnapshot } from './useComposerPluginSelection';
import {
  toggleComposerPlugin,
} from '../../composer/pluginSelection.ts';

function pluginIconMarkup(id: string): string {
  return getConnectorIconMarkupFn()?.(id) || '';
}

function PluginMark({ plugin }: { plugin: PluginCatalogEntry }) {
  const markup = pluginIconMarkup(plugin.id);
  if (markup) {
    return <span className="composer-plugin-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
  }
  return <span className="composer-plugin-mark composer-plugin-mark-fallback" aria-hidden="true">{plugin.name.slice(0, 2).toUpperCase()}</span>;
}

function ComposerPluginItem({
  plugin,
  selected,
  onPick,
}: {
  plugin: PluginCatalogEntry;
  selected: boolean;
  onPick: (plugin: PluginCatalogEntry) => void;
}) {
  return (
    <Button
      type="button"
      className={`composer-tools-plugin-item${selected ? ' is-selected' : ''}`}
      data-composer-plugin={plugin.id}
      role="menuitemcheckbox"
      aria-checked={selected}
      aria-label={selected ? i18n('composer.plugin.added', '{name}: added').replace('{name}', plugin.name) : plugin.name}
      onClick={(event) => {
        event.stopPropagation();
        onPick(plugin);
      }}
    >
      <PluginMark plugin={plugin} />
      <span className="composer-tools-plugin-name">{plugin.name}</span>
      {selected ? (
        <Icon name="check" className="composer-tools-check" />
      ) : null}
    </Button>
  );
}

/* The menu only lists connected apps; connect prompts live in Plugin Center. */
export function ComposerPluginItems({
  isOpen,
  mode,
  onPick,
}: {
  isOpen: boolean;
  mode: 'topic' | 'chat' | null;
  onPick: (action: ComposerToolsAction) => void;
}) {
  const [plugins, setPlugins] = useState<ReadonlyArray<PluginCatalogEntry>>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [attempt, setAttempt] = useState(0);
  const forceNextLoad = useRef(false);
  const selectionSnapshot = useComposerPluginSelectionSnapshot();
  const selectedPlugins = mode ? selectionSnapshot[mode] : [];

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    const force = forceNextLoad.current;
    forceNextLoad.current = false;
    setLoadState('loading');
    loadPluginCatalog(force)
      .then((entries) => {
        if (!cancelled) {
          setPlugins(entries);
          setLoadState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => { cancelled = true; };
  }, [isOpen, attempt]);

  const connectedPlugins = useMemo(
    () => plugins.filter((plugin) => plugin.connectionStatus === 'connected'),
    [plugins],
  );

  const togglePlugin = (plugin: PluginCatalogEntry) => {
    if (!mode) return;
    toggleComposerPlugin(mode, plugin, pluginIconMarkup(plugin.id));
  };
  const connectedCount = plugins.filter((plugin) => plugin.connectionStatus === 'connected').length;
  const retry = () => {
    forceNextLoad.current = true;
    setAttempt((value) => value + 1);
  };
  const managePlugins = () => onPick('managePlugins');

  return (
    <section className="composer-tools-plugins" aria-label={i18n('composer.tools.connectedApps', 'Connected apps')}>
      <div className="composer-tools-group-label">{i18n('composer.tools.connectedApps', 'Connected apps')}</div>
      {loadState === 'loading' || loadState === 'idle' ? (
        <div className="composer-tools-plugin-state" role="status">{i18n('composer.tools.plugins.loading', 'Loading connected apps…')}</div>
      ) : null}
      {loadState === 'error' ? (
        <div className="composer-tools-plugin-state" role="status">
          <span>{i18n('composer.tools.plugins.error', 'Connected apps could not be loaded.')}</span>
          <Button
            type="button"
            className="composer-tools-state-action"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              retry();
            }}
          >
            {i18n('composer.tools.plugins.retry', 'Try again')}
          </Button>
        </div>
      ) : null}
      {loadState === 'ready' && connectedPlugins.length > 0 ? (
        <div className="composer-tools-plugin-list">
          {connectedPlugins.map((plugin) => (
            <ComposerPluginItem
              key={plugin.id}
              plugin={plugin}
              selected={selectedPlugins.some((selectedPlugin) => selectedPlugin.id === plugin.id)}
              onPick={togglePlugin}
            />
          ))}
        </div>
      ) : null}
      {loadState === 'ready' && connectedCount === 0 ? (
        <div className="composer-tools-plugin-state">
          <span>{i18n('composer.tools.plugins.empty', 'No connected apps yet.')}</span>
          <small>{i18n('composer.tools.plugins.emptyHint', 'Connect an app to add its context to a chat.')}</small>
          <Button type="button" className="composer-tools-state-action" role="menuitem" onClick={managePlugins}>
            {i18n('composer.tools.plugins.manage', 'Manage apps')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
