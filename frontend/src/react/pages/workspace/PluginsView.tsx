import { useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  const directoryScroll = useRef(0);
  useLayoutEffect(() => {
    const panel = document.getElementById('pluginsPanel');
    if (panel) panel.scrollTop = selectedPluginId ? 0 : directoryScroll.current;
  }, [selectedPluginId]);
  const catalog = useMemo(() => dedupePlugins(plugins), [plugins]);

  const selectedPlugin = useMemo(() => {
    if (!selectedPluginId) return null;
    return catalog.find((p) => p.id === selectedPluginId) || null;
  }, [catalog, selectedPluginId]);

  return <>
    {selectedPlugin ? (
      <PluginDetailView
        plugin={selectedPlugin}
        configured={configured}
        openConnectorAvailable={openConnectorAvailable}
        dispatch={dispatch}
        onBack={() => setSelectedPluginId(null)}
        renderMark={(id, name) => <ConnectorMark id={id} name={name} />}
      />
    ) : null}
    <div hidden={Boolean(selectedPlugin)}>
      <PluginDirectory
        plugins={plugins}
        configured={configured}
        openConnectorAvailable={openConnectorAvailable}
        dispatch={dispatch}
        onSelectPlugin={(id) => {
          directoryScroll.current = document.getElementById('pluginsPanel')?.scrollTop ?? 0;
          setSelectedPluginId(id);
        }}
      />
    </div>
  </>;
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export { PluginsView };
