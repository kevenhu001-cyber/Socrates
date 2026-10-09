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

function BackIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><polyline points="15 18 9 12 15 6" /></svg>;
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
  return (
    <>
      <div className="plugin-detail-nav">
        <button type="button" className="plugin-detail-back-btn" onClick={onBack} aria-label={i18n('plugins.detail.back', 'Back to plugins')}>
          <BackIcon />
          <span>{i18n('plugins.detail.backLabel', 'Plugins')}</span>
        </button>
      </div>

      <div className="plugin-detail-hero">
        <div className={'plugin-detail-logo-tile connector-icon connector-' + plugin.id}>{renderMark(plugin.id, plugin.name)}</div>
        <div className="plugin-detail-hero-content">
          <div className="plugin-detail-title-row"><h2 id="plugin-detail-title">{plugin.name}</h2></div>
          <div className="plugin-detail-status-row">
            {isConnected ? (
              <span className="plugin-detail-status-pill connected">● {i18n('plugins.detail.connected', 'Connected')}</span>
            ) : connectable ? (
              <span className="plugin-detail-status-pill">{i18n('plugins.detail.notConnected', 'Not connected')}</span>
            ) : (
              <span className="plugin-detail-status-pill">{i18n('plugins.detail.unavailable', 'Unavailable')}</span>
            )}
            {plugin.connection?.displayName ? <span className="plugin-detail-status-pill">{plugin.connection.displayName}</span> : null}
          </div>
        </div>
      </div>

      <div className="plugin-detail-cta-bar">
        {isConnected ? (
          <div className="plugin-detail-cta-group">
            <button type="button" className="plugin-detail-btn-primary" onClick={onUseInChat}>{i18n('plugins.detail.useInChat', 'Use in chat')}</button>
            <button type="button" className="plugin-detail-btn-secondary" onClick={onManage}>{i18n('plugins.detail.manage', 'Manage')}</button>
          </div>
        ) : (
          <button type="button" className="plugin-detail-btn-primary" disabled={!connectable} onClick={onConnect}>
            {connectable ? i18n('plugins.detail.connect', 'Install & connect') : i18n('plugins.detail.unavailable', 'Unavailable')}
          </button>
        )}
      </div>
    </>
  );
}
