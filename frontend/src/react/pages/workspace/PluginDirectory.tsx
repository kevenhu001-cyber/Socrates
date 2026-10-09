import { useMemo, useState } from 'react';
import { getCurrentLang } from '../../legacy/gateway.ts';
import { getConnectorIconMarkup } from '../../../connector-icons';
import type { useWorkspaceDispatch } from './workspace.hooks';
import type { PluginItem } from './types';
import { i18n, MoreIcon, PlusIcon, pluginDirectoryRank, installedRank, SearchIcon } from './workspaceUi';

/* Every connector renders a bundled real brand mark from
   src/connector-icons.ts — no remote favicon/image CDNs. Unknown ids fall
   back to a two-letter monogram. */
export function ConnectorMark({ id, name }: { id: string; name: string }) {
  const markup = getConnectorIconMarkup(id) || getConnectorIconMarkup(name);
  if (markup) {
    return (
      <span className="connector-mark-wrap">
        <span dangerouslySetInnerHTML={{ __html: markup }} />
      </span>
    );
  }
  return (
    <span className="connector-logo-fallback" aria-hidden="true">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

type WorkspacePlugin = PluginItem;

function dedupePlugins(plugins: ReadonlyArray<WorkspacePlugin>): WorkspacePlugin[] {
  const seen = new Set<string>();
  const deduped: WorkspacePlugin[] = [];
  const sorted = [...plugins].sort((a, b) => pluginDirectoryRank(a.id) - pluginDirectoryRank(b.id));
  for (const plugin of sorted) {
    const serviceKey = (plugin.id || '').toLowerCase().replace(/^oc_?/, '').replace(/[^a-z0-9]/g, '');
    const nameKey = (plugin.name || '').toLowerCase().replace(/\s+/g, '');
    const canonicalKey = serviceKey || nameKey;
    if (seen.has(canonicalKey) || seen.has(nameKey)) {
      const existing = deduped.find((p) => {
        const pService = (p.id || '').toLowerCase().replace(/^oc_?/, '').replace(/[^a-z0-9]/g, '');
        const pName = (p.name || '').toLowerCase().replace(/\s+/g, '');
        return pService === canonicalKey || pName === nameKey;
      });
      if (existing && !existing.connection?.status && plugin.connection?.status) {
        existing.connection = plugin.connection;
      }
      continue;
    }
    seen.add(canonicalKey);
    seen.add(nameKey);
    deduped.push({ ...plugin });
  }
  return deduped;
}

function PluginDirectory({ plugins, configured, openConnectorAvailable, dispatch, onSelectPlugin }: {
  plugins: ReadonlyArray<WorkspacePlugin>;
  configured: boolean;
  openConnectorAvailable: boolean;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
  onSelectPlugin: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'public' | 'personal'>('public');
  const catalog = useMemo(() => dedupePlugins(plugins), [plugins]);
  const visiblePlugins = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.filter((plugin) => {
      const isInstalled = plugin.connection?.status === 'connected' || plugin.connection?.status === 'initiated';
      if (scope === 'personal' && !isInstalled) return false;
      if (!needle) return true;
      return [plugin.name, plugin.description, ...(plugin.capabilities || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [catalog, query, scope]);
  const installedPlugins = useMemo(
    () =>
      catalog
        .filter((plugin) => plugin.connection?.status === 'connected' || plugin.connection?.status === 'initiated')
        .sort((a, b) => installedRank(a.id) - installedRank(b.id)),
    [catalog],
  );

  const searchLabel = i18n('plugins.search', 'Search plugins');
  const connectedLabel = i18n('plugins.connected', 'Connected');
  const manageLabel = i18n('plugins.manage', 'Manage');
  const refreshLabel = i18n('plugins.refreshStatus', 'Refresh status');
  const connectLabel = i18n('plugins.connect', 'Connect');

  /* One action per app, mirroring the connection state. The visible label
     carries the meaning; title/aria-label keep the same contract the dialogs
     and the smoke specs assert on. */
  const renderAction = (plugin: WorkspacePlugin) => {
    const status = plugin.connection?.status;
    if (status === 'connected') {
      return (
        <button type="button" className="plugin-directory-icon-action" aria-label={manageLabel + ' ' + plugin.name} title={manageLabel} onClick={() => dispatch.openPluginForm(plugin.id)}>
          <MoreIcon />
          <span className="plugin-directory-action-label">{manageLabel}</span>
        </button>
      );
    }
    if (status === 'initiated') {
      return (
        <button type="button" className="plugin-directory-icon-action" aria-label={refreshLabel + ' ' + plugin.name} title={refreshLabel} onClick={() => dispatch.refreshPlugin(plugin.id)}>
          <PlusIcon />
          <span className="plugin-directory-action-label">{refreshLabel}</span>
        </button>
      );
    }
    /* Legacy OOMOL apps need the gateway configured; OpenConnector apps
       need the hosted runtime actually serving them (available: true).
       Stub catalog entries (available: false) stay disabled until the
       gateway snapshot covers the app. */
    const isOc = plugin.id.startsWith('oc_');
    const connectable = plugin.available !== false && (isOc || configured);
    const connectTitle = connectable ? connectLabel : i18n('plugins.serverSetupNeeded', 'Unavailable');
    const openForm = () => dispatch.openPluginForm(plugin.id);
    const connect = () => dispatch.connectPlugin(plugin.id);
    const onClick = plugin.authType === 'api_key' || plugin.authType === 'custom_credential' ? openForm : connect;
    return (
      <button type="button" className="plugin-directory-icon-action" disabled={!connectable} aria-label={connectTitle + ' ' + plugin.name} title={connectTitle} onClick={onClick}>
        <PlusIcon />
        <span className="plugin-directory-action-label">{connectable ? connectLabel : i18n('plugins.unavailable', 'Unavailable')}</span>
      </button>
    );
  };

  const popularPlugins = visiblePlugins.slice(0, 5);
  const newPlugins = visiblePlugins.slice(5);

  const renderCard = (plugin: WorkspacePlugin) => (
    <article
      className="connector-row plugin-directory-row"
      data-connector-id={plugin.id}
      key={plugin.id}
      onClick={() => onSelectPlugin(plugin.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectPlugin(plugin.id);
        }
      }}
    >
      <span className={'workspace-row-icon connector-icon connector-' + plugin.id}><ConnectorMark id={plugin.id} name={plugin.name} /></span>
      <div className="workspace-row-copy">
        <div className="plugin-directory-card-title-row">
          <strong>{plugin.name}</strong>
          {plugin.connection?.status === 'connected' ? <span className="plugin-directory-card-status">{connectedLabel}</span> : null}
        </div>
        <p className="plugin-directory-card-desc">{plugin.description || i18n('plugins.noDescription', 'Use this app in chat')}</p>
      </div>
      <div className="plugin-directory-row-action" onClick={(e) => e.stopPropagation()}>{renderAction(plugin)}</div>
    </article>
  );

  return (
    <section className="workspace-surface plugin-directory" aria-labelledby="plugin-directory-title">
      <div className="plugin-directory-head">
        <div className="plugin-directory-heading">
          <h2 id="plugin-directory-title">{i18n('sidebar.plugins.title', 'Plugins')}</h2>
          <p className="plugin-directory-desc">{i18n('plugins.directoryDesc', 'Connect apps so Socrates can use them in chat.')}</p>
        </div>
        <div className="plugin-directory-tools">
          <label className="plugin-directory-search"><SearchIcon /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchLabel} aria-label={searchLabel} /></label>
          <button type="button" className="plugin-directory-add-btn" aria-label={getCurrentLang() === 'zh' ? '添加插件' : 'Add plugin'} onClick={() => {
            setScope('public'); setQuery('');
            document.querySelector<HTMLInputElement>('.plugin-directory-search input')?.focus();
          }}><PlusIcon /></button>
        </div>
      </div>

      {installedPlugins.length > 0 ? (
        <div className="plugin-installed-strip" aria-label={i18n('plugins.installed', 'Installed')}>
          <button type="button" className="plugin-installed-label" onClick={() => setScope('personal')}>
            {i18n('plugins.installed', 'Installed')}
            <span className="plugin-installed-caret" aria-hidden="true">›</span>
          </button>
          <div className="plugin-installed-icons">
            {installedPlugins.map((plugin) => (
              <button
                type="button"
                className={'workspace-row-icon connector-icon connector-' + plugin.id}
                key={plugin.id}
                title={plugin.name}
                onClick={() => onSelectPlugin(plugin.id)}
              >
                <ConnectorMark id={plugin.id} name={plugin.name} />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="plugin-directory-tabs" role="tablist" aria-label={i18n('plugins.allPlugins', 'All plugins')}>
        <button type="button" role="tab" aria-selected={scope === 'public'} className={scope === 'public' ? 'active' : ''} onClick={() => setScope('public')}>
          {i18n('plugins.public', 'Public')}
        </button>
        <button type="button" role="tab" aria-selected={scope === 'personal'} className={scope === 'personal' ? 'active' : ''} onClick={() => setScope('personal')}>
          {i18n('plugins.personal', 'Personal')}
        </button>
      </div>

      <div className="plugin-directory-body">
        {visiblePlugins.length === 0 ? <div className="plugin-directory-empty"><strong>{i18n('plugins.noMatch', 'No matching plugins')}</strong><span>{i18n('plugins.tryDifferent', 'Try a different search.')}</span></div> : null}
        {popularPlugins.length > 0 ? <section className="plugin-directory-section"><h3>{i18n('plugins.popular', 'Popular')}</h3><div className="plugin-directory-list">{popularPlugins.map(renderCard)}</div></section> : null}
        {newPlugins.length > 0 ? <section className="plugin-directory-section"><h3>{i18n('plugins.new', 'New and notable')}</h3><div className="plugin-directory-list">{newPlugins.map(renderCard)}</div></section> : null}
      </div>
      {!configured && !openConnectorAvailable && plugins.length > 0 ? <p className="plugin-directory-note">{i18n('plugins.serverSetupNeeded', 'Connector service needs setup')}</p> : null}
    </section>
  );
}

export { dedupePlugins, PluginDirectory };
