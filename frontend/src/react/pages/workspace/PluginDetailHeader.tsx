import { Icon } from '../../../legacy/Icon';
import { Button } from '../../ui/shadcn/button';
import { PageHeader } from '../../ui/page/PageHeader';
import { i18n } from './workspaceUi';
import type { WorkspacePluginBasic } from './pluginDetail.types';

interface PluginDetailHeaderProps {
  plugin: WorkspacePluginBasic;
  connectable: boolean;
  isConnected: boolean;
  canUseInChat: boolean;
  renderMark: (id: string, name: string) => React.ReactNode;
  onBack: () => void;
  onConnect: () => void;
  onManage: () => void;
  onRefresh: () => void;
  onUseInChat: () => void;
}

export function PluginDetailHeader({
  plugin,
  connectable,
  isConnected,
  canUseInChat,
  renderMark,
  onBack,
  onConnect,
  onManage,
  onRefresh,
  onUseInChat,
}: PluginDetailHeaderProps) {
  const pending = plugin.connection?.status === 'initiated';
  const failed = ['failed', 'error', 'expired'].includes(plugin.connection?.status || '');
  const status = isConnected
    ? i18n('plugins.detail.connected', 'Connected')
    : pending
      ? i18n('plugins.detail.pending', 'Awaiting authorization')
      : failed
        ? i18n('plugins.detail.failed', 'Connection failed')
        : connectable
          ? i18n('plugins.detail.notConnected', 'Not connected')
          : i18n('plugins.detail.unavailable', 'Unavailable');

  return (
    <PageHeader
      variant="account"
      className="plugin-detail-page-header"
      titleId="plugin-detail-title"
      title={plugin.name}
      titleTabIndex={-1}
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
              disabled={!canUseInChat || !connectable}
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
        ) : pending ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="plugin-detail-btn-primary w-full rounded-full"
            onClick={onRefresh}
          >
            {i18n('plugins.refreshStatus', 'Refresh status')}
          </Button>
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
