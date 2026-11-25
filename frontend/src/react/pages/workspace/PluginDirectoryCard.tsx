import { Icon } from '../../../legacy/Icon';
import { Button } from '../../ui/shadcn/button';
import { i18n, MoreIcon, PlusIcon } from './workspaceUi';
import { ConnectorMark } from './ConnectorMark';
import { pluginDescription } from './pluginDetailContent';
import type { useWorkspaceDispatch } from './workspace.hooks';
import type { PluginItem } from './types';

interface PluginDirectoryCardProps {
  plugin: PluginItem;
  configured: boolean;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
  onSelect: (id: string) => void;
}

function PluginConnectionAction({
  plugin,
  configured,
  dispatch,
}: Omit<PluginDirectoryCardProps, 'onSelect'>) {
  const status = plugin.connection?.status;
  if (status === 'connected') {
    const label = i18n('plugins.manage', 'Manage');
    return (
      <Button
        type="button"
        variant="outline"
        size="default"
        className="plugin-directory-icon-action rounded-full"
        aria-label={label + ' ' + plugin.name}
        title={label}
        onClick={() => dispatch.openPluginForm(plugin.id)}
      >
        <MoreIcon />
        <span className="plugin-directory-action-label">{label}</span>
      </Button>
    );
  }
  if (status === 'initiated') {
    const label = i18n('plugins.refreshStatus', 'Refresh status');
    return (
      <Button
        type="button"
        variant="outline"
        size="default"
        className="plugin-directory-icon-action rounded-full"
        aria-label={label + ' ' + plugin.name}
        title={label}
        onClick={() => dispatch.refreshPlugin(plugin.id)}
      >
        <Icon name="regenerate" size={16} />
        <span className="plugin-directory-action-label">{label}</span>
      </Button>
    );
  }

  /* OpenConnector apps use the hosted runtime. Legacy apps require the
     gateway; unavailable catalog entries remain disabled until configured. */
  const isOpenConnector = plugin.id.startsWith('oc_');
  const connectable = plugin.available !== false && (isOpenConnector || configured);
  const label = connectable
    ? i18n('plugins.connect', 'Connect')
    : i18n('plugins.serverSetupNeeded', 'Unavailable');
  const needsCredentials = plugin.authType === 'api_key' || plugin.authType === 'custom_credential';
  const onClick = needsCredentials
    ? () => dispatch.openPluginForm(plugin.id)
    : () => dispatch.connectPlugin(plugin.id);
  return (
    <Button
      type="button"
      variant="outline"
      size="default"
      className="plugin-directory-icon-action rounded-full"
      disabled={!connectable}
      aria-label={label + ' ' + plugin.name}
      title={label}
      onClick={onClick}
    >
      <PlusIcon />
      <span className="plugin-directory-action-label">
        {connectable
          ? i18n('plugins.connect', 'Connect')
          : i18n('plugins.unavailable', 'Unavailable')}
      </span>
    </Button>
  );
}

export function PluginDirectoryCard({
  plugin,
  configured,
  dispatch,
  onSelect,
}: PluginDirectoryCardProps) {
  const connectedLabel = i18n('plugins.connected', 'Connected');
  const description = pluginDescription(plugin);
  return (
    <article
      className="connector-row plugin-directory-row"
      data-connector-id={plugin.id}
      key={plugin.id}
    >
      <Button
        type="button"
        variant="ghost"
        size="surface"
        className="plugin-directory-card-main justify-start whitespace-normal"
        onClick={() => onSelect(plugin.id)}
        aria-label={plugin.name}
      >
        <span className={'workspace-row-icon connector-icon connector-' + plugin.id}>
          <ConnectorMark id={plugin.id} name={plugin.name} />
        </span>
        <span className="workspace-row-copy">
          <span className="plugin-directory-card-title-row">
            <strong>{plugin.name}</strong>
            {plugin.connection?.status === 'connected' ? (
              <span className="plugin-directory-card-status">{connectedLabel}</span>
            ) : null}
          </span>
          <span className="plugin-directory-card-desc">{description}</span>
        </span>
      </Button>
      <div className="plugin-directory-row-action">
        <PluginConnectionAction plugin={plugin} configured={configured} dispatch={dispatch} />
      </div>
    </article>
  );
}
