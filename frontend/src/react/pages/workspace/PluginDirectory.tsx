import { Button } from '../../ui/shadcn/button';
import { useMemo, useState } from 'react';
import { getCurrentLang } from '../../../ui/legacyI18n.ts';
import type { useWorkspaceDispatch } from './workspace.hooks';
import type { PluginItem } from './types';
import { i18n, installedRank, PlusIcon } from './workspaceUi';
import { PluginDirectoryCard } from './PluginDirectoryCard';
import { InstalledPluginStrip } from './InstalledPluginStrip';
import { dedupePlugins } from './pluginDirectory.data';
import { PageEmptyState } from '../../ui/page/PageEmptyState';
import { PageFrame } from '../../ui/page/PageFrame';
import { PageHeader } from '../../ui/page/PageHeader';
import { PageSearchField } from '../../ui/page/PageSearchField';
import { PageTabs } from '../../ui/page/PageTabs';
import { PageToolbar } from '../../ui/page/PageToolbar';

interface PluginDirectoryProps {
  readonly plugins: ReadonlyArray<PluginItem>;
  readonly configured: boolean;
  readonly openConnectorAvailable: boolean;
  readonly dispatch: ReturnType<typeof useWorkspaceDispatch>;
  readonly onSelectPlugin: (id: string) => void;
}

function isInstalled(plugin: PluginItem): boolean {
  return plugin.connection?.status === 'connected' || plugin.connection?.status === 'initiated';
}

function PluginDirectoryAddAction({
  setQuery,
  setScope,
}: Readonly<{
  setQuery: (q: string) => void;
  setScope: (scope: 'public' | 'personal') => void;
}>) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-lg"
      className="plugin-directory-add-btn rounded-full"
      aria-label={getCurrentLang() === 'zh' ? '添加插件' : 'Add plugin'}
      onClick={() => {
        setScope('public');
        setQuery('');
        document.querySelector<HTMLInputElement>('.plugin-directory-search input')?.focus();
      }}
    >
      <PlusIcon />
    </Button>
  );
}

function PluginDirectoryBody({
  visiblePlugins,
  sectionTitle,
  popularPlugins,
  newPlugins,
  configured,
  dispatch,
  onSelectPlugin,
}: Readonly<{
  visiblePlugins: PluginItem[];
  sectionTitle: string;
  popularPlugins: PluginItem[];
  newPlugins: PluginItem[];
  configured: boolean;
  dispatch: PluginDirectoryProps['dispatch'];
  onSelectPlugin: (id: string) => void;
}>) {
  return (
    <div className="plugin-directory-body">
      {visiblePlugins.length === 0 ? (
        <PageEmptyState
          title={i18n('plugins.noMatch', 'No matching plugins')}
          description={i18n('plugins.tryDifferent', 'Try a different search.')}
        />
      ) : null}
      {popularPlugins.length > 0 ? (
        <section className="ui-page-section plugin-directory-section">
          <div className="ui-page-section-head">
            <h2>{sectionTitle}</h2>
          </div>
          <div className="plugin-directory-list">
            {popularPlugins.map((plugin) => (
              <PluginDirectoryCard
                key={plugin.id}
                plugin={plugin}
                configured={configured}
                dispatch={dispatch}
                onSelect={onSelectPlugin}
              />
            ))}
          </div>
        </section>
      ) : null}
      {newPlugins.length > 0 ? (
        <section className="ui-page-section plugin-directory-section">
          <div className="ui-page-section-head">
            <h2>{i18n('plugins.new', 'New and notable')}</h2>
          </div>
          <div className="plugin-directory-list">
            {newPlugins.map((plugin) => (
              <PluginDirectoryCard
                key={plugin.id}
                plugin={plugin}
                configured={configured}
                dispatch={dispatch}
                onSelect={onSelectPlugin}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function PluginDirectory({
  plugins,
  configured,
  openConnectorAvailable,
  dispatch,
  onSelectPlugin,
}: PluginDirectoryProps) {
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
  const browse = scope === 'public' && !query.trim();
  const popularPlugins = browse ? visiblePlugins.slice(0, 5) : visiblePlugins;
  const newPlugins = browse ? visiblePlugins.slice(5) : [];
  const searchLabel = i18n('plugins.search', 'Search plugins');

  return (
    <PageFrame className="plugin-directory" aria-labelledby="plugin-directory-title">
      <PageHeader
        titleId="plugin-directory-title"
        title={i18n('sidebar.plugins.title', 'Plugins')}
        description={i18n(
          'plugins.directoryDesc',
          'Connect apps so Socrates can use them in chat.',
        )}
        actions={<PluginDirectoryAddAction setQuery={setQuery} setScope={setScope} />}
      />

      <PageToolbar>
        <PageSearchField
          className="plugin-directory-search"
          label={searchLabel}
          query={query}
          onQuery={setQuery}
        />
        <div className="ui-page-toolbar-end">
          <PageTabs
            className="plugin-directory-tabs"
            items={[
              { value: 'public', label: i18n('plugins.public', 'Public') },
              { value: 'personal', label: i18n('plugins.personal', 'Personal') },
            ]}
            value={scope}
            onChange={setScope}
            ariaLabel={i18n('plugins.allPlugins', 'All plugins')}
          />
        </div>
      </PageToolbar>

      {browse ? <InstalledPluginStrip
        plugins={installedPlugins}
        onSelect={onSelectPlugin}
        onShowPersonal={() => setScope('personal')}
      /> : null}

      <PluginDirectoryBody
        visiblePlugins={visiblePlugins}
        sectionTitle={query.trim() ? i18n('plugins.searchResults', 'Search results') : scope === 'personal' ? i18n('plugins.installed', 'Installed') : i18n('plugins.popular', 'Popular')}
        popularPlugins={popularPlugins}
        newPlugins={newPlugins}
        configured={configured}
        dispatch={dispatch}
        onSelectPlugin={onSelectPlugin}
      />

      {!configured && !openConnectorAvailable && plugins.length > 0 ? (
        <p className="plugin-directory-note">
          {i18n('plugins.serverSetupNeeded', 'Connector service needs setup')}
        </p>
      ) : null}
    </PageFrame>
  );
}

export { ConnectorMark } from './ConnectorMark';
export { dedupePlugins } from './pluginDirectory.data';
