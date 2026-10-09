import { useEffect, useMemo, useState } from 'react';

import { i18n } from './composerToolsMenuData';
import type { ComposerToolsAction } from './types';
import { loadPluginCatalog, pluginIconMarkup, type PluginCatalogEntry } from './pluginCatalog';
import {
  toggleComposerPlugin,
  useComposerPluginSelectionSnapshot,
} from './pluginSelection';

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
    <button
      type="button"
      className={`composer-tools-plugin-item${selected ? ' is-selected' : ''}`}
      data-composer-plugin={plugin.id}
      role="menuitem"
      aria-pressed={selected}
      aria-label={`${plugin.name}${selected ? ': added' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        onPick(plugin);
      }}
    >
      <PluginMark plugin={plugin} />
      <span className="composer-tools-plugin-name">{plugin.name}</span>
      {selected ? (
        <svg className="composer-tools-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
      ) : null}
    </button>
  );
}

/* The menu only lists connected apps; connect prompts live in Plugin Center. */
export function ComposerPluginItems({
  isOpen,
  mode,
  query,
  onPick,
}: {
  isOpen: boolean;
  mode: 'topic' | 'chat' | null;
  query: string;
  onPick: (action: ComposerToolsAction) => void;
}) {
  const [plugins, setPlugins] = useState<ReadonlyArray<PluginCatalogEntry>>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const selectionSnapshot = useComposerPluginSelectionSnapshot();
  const selectedPlugins = mode ? selectionSnapshot[mode] : [];

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setLoadState('loading');
    loadPluginCatalog()
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
  }, [isOpen]);

  const connectedPlugins = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return plugins.filter((plugin) => {
      if (plugin.connectionStatus !== 'connected') return false;
      if (!normalized) return true;
      return [plugin.name, plugin.description, ...plugin.capabilities]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }, [plugins, query]);

  const togglePlugin = (plugin: PluginCatalogEntry) => {
    if (!mode) return;
    toggleComposerPlugin(mode, plugin, pluginIconMarkup(plugin.id));
  };
  const connectedCount = plugins.filter((plugin) => plugin.connectionStatus === 'connected').length;
  const retry = () => {
    setLoadState('loading');
    loadPluginCatalog(true)
      .then((entries) => {
        setPlugins(entries);
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
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
          <button
            type="button"
            className="composer-tools-state-action"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              retry();
            }}
          >
            {i18n('composer.tools.plugins.retry', 'Try again')}
          </button>
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
          <button type="button" className="composer-tools-state-action" role="menuitem" onClick={managePlugins}>
            {i18n('composer.tools.plugins.manage', 'Manage apps')}
          </button>
        </div>
      ) : null}
      {loadState === 'ready' && connectedCount > 0 && connectedPlugins.length === 0 ? (
        <div className="composer-tools-plugin-state" role="status">
          <span>{i18n('composer.tools.plugins.noMatch', 'No connected apps match this search.')}</span>
          <button type="button" className="composer-tools-state-action" role="menuitem" onClick={managePlugins}>
            {i18n('composer.tools.plugins.manage', 'Manage apps')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
