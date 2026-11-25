import { Icon } from '../../../legacy/Icon';
import { Button } from '../../ui/shadcn/button';
import { PageHeader } from '../../ui/page/PageHeader';
import { i18n } from './workspaceUi';
import type { WorkspacePluginBasic } from './pluginDetail.types';

interface PluginDetailHeaderProps {
  plugin: WorkspacePluginBasic;
  connectable: boolean;
  isConnected: boolean;
  renderMark: (id: string, name: string) => React.ReactNode;
  onBack: () => void;
  onConnect: () => void;
  onManage: () => void;
  onUseInChat: () => void;
}

export function PluginDetailHeader({
  plugin,
  connectable,
  isConnected,
  renderMark,
  onBack,
  onConnect,
  onManage,
  onUseInChat,
}: PluginDetailHeaderProps) {
  const status = isConnected
    ? i18n('plugins.detail.connected', 'Connected')
    : connectable
      ? i18n('plugins.detail.notConnected', 'Not connected')
      : i18n('plugins.detail.unavailable', 'Unavailable');

  return (
    <PageHeader
      variant="account"
      className="plugin-detail-page-header"
      titleId="plugin-detail-title"
      title={plugin.name}
      leading={
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="plugin-detail-back-btn"
            onClick={onBack}
            aria-label={i18n('plugins.detail.back', 'Back to plugins')}
          >
            <Icon name="chevronLeft" size={18} />
            <span>{i18n('plugins.detail.backLabel', 'Plugins')}</span>
          </Button>
          <div className={'plugin-detail-logo-tile connector-icon connector-' + plugin.id}>
            {renderMark(plugin.id, plugin.name)}
          </div>
        </>
      }
      description={
        <span className="plugin-detail-status-row">
          <span className={'plugin-detail-status-pill' + (isConnected ? ' connected' : '')}>
            {status}
          </span>
          {plugin.connection?.displayName ? (
            <span className="plugin-detail-status-pill">{plugin.connection.displayName}</span>
          ) : null}
        </span>
      }
      actions={
        isConnected ? (
          <div className="plugin-detail-cta-group">
            <Button
              type="button"
              variant="default"
              size="lg"
              className="plugin-detail-btn-primary min-w-0 flex-1 rounded-full"
              onClick={onUseInChat}
            >
              {i18n('plugins.detail.useInChat', 'Use in chat')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="plugin-detail-btn-secondary shrink-0 rounded-full"
              onClick={onManage}
            >
              {i18n('plugins.detail.manage', 'Manage')}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="default"
            size="lg"
            className="plugin-detail-btn-primary w-full rounded-full"
            disabled={!connectable}
            onClick={onConnect}
          >
            {connectable
              ? i18n('plugins.detail.connect', 'Install & connect')
              : i18n('plugins.detail.unavailable', 'Unavailable')}
          </Button>
        )
      }
    />
  );
}
