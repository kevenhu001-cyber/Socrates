import { useMemo, useState } from 'react';
import { PluginDetailView } from './PluginDetailView';
import { PluginDirectory, ConnectorMark, dedupePlugins } from './PluginDirectory';
import type { useWorkspaceDispatch } from './workspace.hooks';
import type { PluginItem } from './types';

function PluginsView({ plugins, configured, openConnectorAvailable, dispatch }: {
  plugins: ReadonlyArray<PluginItem>;
  configured: boolean;
  openConnectorAvailable: boolean;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const catalog = useMemo(() => dedupePlugins(plugins), [plugins]);

  const selectedPlugin = useMemo(() => {
    if (!selectedPluginId) return null;
    return catalog.find((p) => p.id === selectedPluginId) || null;
  }, [catalog, selectedPluginId]);

  if (selectedPlugin) {
    return (
      <PluginDetailView
        plugin={selectedPlugin}
        configured={configured}
        openConnectorAvailable={openConnectorAvailable}
        dispatch={dispatch}
        onBack={() => setSelectedPluginId(null)}
        renderMark={(id, name) => <ConnectorMark id={id} name={name} />}
      />
    );
  }

  return (
    <PluginDirectory
      plugins={plugins}
      configured={configured}
      openConnectorAvailable={openConnectorAvailable}
      dispatch={dispatch}
      onSelectPlugin={(id) => setSelectedPluginId(id)}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export { PluginsView };
