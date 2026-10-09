import { useMemo, useState } from 'react';
import { getCurrentLang } from '../../legacy/gateway.ts';
import type { useWorkspaceDispatch } from './workspace.hooks';
import type { PluginItem } from './types';
import { i18n, installedRank, PlusIcon, SearchIcon } from './workspaceUi';
import { PluginDirectoryCard } from './PluginDirectoryCard';
import { InstalledPluginStrip } from './InstalledPluginStrip';
import { dedupePlugins } from './pluginDirectory.data';

interface PluginDirectoryProps {
  plugins: ReadonlyArray<PluginItem>;
  configured: boolean;
  openConnectorAvailable: boolean;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
  onSelectPlugin: (id: string) => void;
}

function isInstalled(plugin: PluginItem): boolean {
  return plugin.connection?.status === 'connected' || plugin.connection?.status === 'initiated';
}

export function PluginDirectory({ plugins, configured, openConnectorAvailable, dispatch, onSelectPlugin }: PluginDirectoryProps) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'public' | 'personal'>('public');
  const catalog = useMemo(() => dedupePlugins(plugins), [plugins]);
  const visiblePlugins = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.filter((plugin) => {
      if (scope === 'personal' && !isInstalled(plugin)) return false;
      if (!needle) return true;
      return [plugin.name, plugin.description, ...(plugin.capabilities || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [catalog, query, scope]);
  const installedPlugins = useMemo(
    () => catalog.filter(isInstalled).sort((a, b) => installedRank(a.id) - installedRank(b.id)),
    [catalog],
  );
  const popularPlugins = visiblePlugins.slice(0, 5);
  const newPlugins = visiblePlugins.slice(5);
  const searchLabel = i18n('plugins.search', 'Search plugins');

  return (
    <section className="workspace-surface plugin-directory" aria-labelledby="plugin-directory-title">
      <div className="plugin-directory-head">
        <div className="plugin-directory-heading">
          <h2 id="plugin-directory-title">{i18n('sidebar.plugins.title', 'Plugins')}</h2>
          <p className="plugin-directory-desc">{i18n('plugins.directoryDesc', 'Connect apps so Socrates can use them in chat.')}</p>
        </div>
        <div className="plugin-directory-tools">
          <label className="plugin-directory-search">
            <SearchIcon />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchLabel} aria-label={searchLabel} />
          </label>
          <button
            type="button"
            className="plugin-directory-add-btn"
            aria-label={getCurrentLang() === 'zh' ? '添加插件' : 'Add plugin'}
            onClick={() => {
              setScope('public');
              setQuery('');
              document.querySelector<HTMLInputElement>('.plugin-directory-search input')?.focus();
            }}
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      <InstalledPluginStrip
        plugins={installedPlugins}
        onSelect={onSelectPlugin}
        onShowPersonal={() => setScope('personal')}
      />

      <div className="plugin-directory-tabs" role="tablist" aria-label={i18n('plugins.allPlugins', 'All plugins')}>
        <button type="button" role="tab" aria-selected={scope === 'public'} className={scope === 'public' ? 'active' : ''} onClick={() => setScope('public')}>
          {i18n('plugins.public', 'Public')}
        </button>
        <button type="button" role="tab" aria-selected={scope === 'personal'} className={scope === 'personal' ? 'active' : ''} onClick={() => setScope('personal')}>
          {i18n('plugins.personal', 'Personal')}
        </button>
      </div>

      <div className="plugin-directory-body">
        {visiblePlugins.length === 0 ? (
          <div className="plugin-directory-empty">
            <strong>{i18n('plugins.noMatch', 'No matching plugins')}</strong>
            <span>{i18n('plugins.tryDifferent', 'Try a different search.')}</span>
          </div>
        ) : null}
        {popularPlugins.length > 0 ? (
          <section className="plugin-directory-section">
            <h3>{i18n('plugins.popular', 'Popular')}</h3>
            <div className="plugin-directory-list">
              {popularPlugins.map((plugin) => <PluginDirectoryCard key={plugin.id} plugin={plugin} configured={configured} dispatch={dispatch} onSelect={onSelectPlugin} />)}
            </div>
          </section>
        ) : null}
        {newPlugins.length > 0 ? (
          <section className="plugin-directory-section">
            <h3>{i18n('plugins.new', 'New and notable')}</h3>
            <div className="plugin-directory-list">
              {newPlugins.map((plugin) => <PluginDirectoryCard key={plugin.id} plugin={plugin} configured={configured} dispatch={dispatch} onSelect={onSelectPlugin} />)}
            </div>
          </section>
        ) : null}
      </div>
      {!configured && !openConnectorAvailable && plugins.length > 0 ? <p className="plugin-directory-note">{i18n('plugins.serverSetupNeeded', 'Connector service needs setup')}</p> : null}
    </section>
  );
}

export { ConnectorMark } from './ConnectorMark';
export { dedupePlugins } from './pluginDirectory.data';
