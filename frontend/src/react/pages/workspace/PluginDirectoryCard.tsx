import { i18n, MoreIcon, PlusIcon } from './workspaceUi';
import { ConnectorMark } from './ConnectorMark';
import type { useWorkspaceDispatch } from './workspace.hooks';
import type { PluginItem } from './types';

interface PluginDirectoryCardProps {
  plugin: PluginItem;
  configured: boolean;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
  onSelect: (id: string) => void;
}

function PluginConnectionAction({ plugin, configured, dispatch }: Omit<PluginDirectoryCardProps, 'onSelect'>) {
  const status = plugin.connection?.status;
  if (status === 'connected') {
    const label = i18n('plugins.manage', 'Manage');
    return (
      <button type="button" className="plugin-directory-icon-action" aria-label={label + ' ' + plugin.name} title={label} onClick={() => dispatch.openPluginForm(plugin.id)}>
        <MoreIcon />
        <span className="plugin-directory-action-label">{label}</span>
      </button>
    );
  }
  if (status === 'initiated') {
    const label = i18n('plugins.refreshStatus', 'Refresh status');
    return (
      <button type="button" className="plugin-directory-icon-action" aria-label={label + ' ' + plugin.name} title={label} onClick={() => dispatch.refreshPlugin(plugin.id)}>
        <PlusIcon />
        <span className="plugin-directory-action-label">{label}</span>
      </button>
    );
  }

  /* OpenConnector apps use the hosted runtime. Legacy apps require the
     gateway; unavailable catalog entries remain disabled until configured. */
  const isOpenConnector = plugin.id.startsWith('oc_');
  const connectable = plugin.available !== false && (isOpenConnector || configured);
  const label = connectable ? i18n('plugins.connect', 'Connect') : i18n('plugins.serverSetupNeeded', 'Unavailable');
  const needsCredentials = plugin.authType === 'api_key' || plugin.authType === 'custom_credential';
  const onClick = needsCredentials
    ? () => dispatch.openPluginForm(plugin.id)
    : () => dispatch.connectPlugin(plugin.id);
  return (
    <button type="button" className="plugin-directory-icon-action" disabled={!connectable} aria-label={label + ' ' + plugin.name} title={label} onClick={onClick}>
      <PlusIcon />
      <span className="plugin-directory-action-label">{connectable ? i18n('plugins.connect', 'Connect') : i18n('plugins.unavailable', 'Unavailable')}</span>
    </button>
  );
}

export function PluginDirectoryCard({ plugin, configured, dispatch, onSelect }: PluginDirectoryCardProps) {
  const connectedLabel = i18n('plugins.connected', 'Connected');
  const description = plugin.description || i18n('plugins.noDescription', 'Use this app in chat');
  return (
    <article
      className="connector-row plugin-directory-row"
      data-connector-id={plugin.id}
      key={plugin.id}
      onClick={() => onSelect(plugin.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(plugin.id);
        }
      }}
    >
      <span className={'workspace-row-icon connector-icon connector-' + plugin.id}><ConnectorMark id={plugin.id} name={plugin.name} /></span>
      <div className="workspace-row-copy">
        <div className="plugin-directory-card-title-row">
          <strong>{plugin.name}</strong>
          {plugin.connection?.status === 'connected' ? <span className="plugin-directory-card-status">{connectedLabel}</span> : null}
        </div>
        <p className="plugin-directory-card-desc">{description}</p>
      </div>
      <div className="plugin-directory-row-action" onClick={(event) => event.stopPropagation()}>
        <PluginConnectionAction plugin={plugin} configured={configured} dispatch={dispatch} />
      </div>
    </article>
  );
}
