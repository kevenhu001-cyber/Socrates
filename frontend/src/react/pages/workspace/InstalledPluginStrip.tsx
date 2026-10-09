import { i18n } from './workspaceUi';
import { ConnectorMark } from './ConnectorMark';
import type { PluginItem } from './types';

interface InstalledPluginStripProps {
  plugins: ReadonlyArray<PluginItem>;
  onSelect: (id: string) => void;
  onShowPersonal: () => void;
}

export function InstalledPluginStrip({ plugins, onSelect, onShowPersonal }: InstalledPluginStripProps) {
  if (plugins.length === 0) return null;
  return (
    <div className="plugin-installed-strip" aria-label={i18n('plugins.installed', 'Installed')}>
      <button type="button" className="plugin-installed-label" onClick={onShowPersonal}>
        {i18n('plugins.installed', 'Installed')}
        <span className="plugin-installed-caret" aria-hidden="true">›</span>
      </button>
      <div className="plugin-installed-icons">
        {plugins.map((plugin) => (
          <button
            type="button"
            className={'workspace-row-icon connector-icon connector-' + plugin.id}
            key={plugin.id}
            title={plugin.name}
            onClick={() => onSelect(plugin.id)}
          >
            <ConnectorMark id={plugin.id} name={plugin.name} />
          </button>
        ))}
      </div>
    </div>
  );
}
