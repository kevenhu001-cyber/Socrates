import React from 'react';
import { i18n, getLegacyActions } from '../../legacy/gateway.ts';
import { focusComposer } from '../../composer-input';
import { toggleComposerPlugin } from '../../composer/pluginSelection';
import { getConnectorIconMarkup } from '../../../connector-icons';
import type { useWorkspaceDispatch } from './workspace.hooks';

export interface WorkspacePluginBasic {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
  authType?: string;
  connection?: { status?: string; displayName?: string } | null;
  available?: boolean;
}

export interface PluginDetailViewProps {
  plugin: WorkspacePluginBasic;
  configured: boolean;
  openConnectorAvailable: boolean;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
  onBack: () => void;
  renderMark: (id: string, name: string) => React.ReactNode;
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function authTypeLabel(authType?: string): string {
  if (authType === 'api_key') return i18n('plugins.detail.authApiKey', 'API key');
  if (authType === 'custom_credential') return i18n('plugins.detail.authCustom', 'Custom credentials');
  if (authType === 'public') return i18n('plugins.detail.authPublic', 'Public — no sign-in needed');
  return i18n('plugins.detail.authOauth', 'OAuth 2.0');
}

export function PluginDetailView({
  plugin,
  configured,
  dispatch,
  onBack,
  renderMark,
}: PluginDetailViewProps) {
  const isConnected = plugin.connection?.status === 'connected';
  const isOc = plugin.id.startsWith('oc_');
  const connectable = plugin.available !== false && (isOc || configured);
  const capabilities = Array.isArray(plugin.capabilities) ? plugin.capabilities.filter(Boolean) : [];

  React.useEffect(() => {
    window.scrollTo(0, 0);
    const panel = document.getElementById('pluginsPanel');
    if (panel) panel.scrollTop = 0;
  }, []);

  const handleBack = () => {
    const panel = document.getElementById('pluginsPanel');
    if (panel) panel.scrollTop = 0;
    onBack();
  };

  const handleConnect = () => {
    if (plugin.authType === 'api_key' || plugin.authType === 'custom_credential') {
      dispatch.openPluginForm(plugin.id);
    } else {
      dispatch.connectPlugin(plugin.id);
    }
  };

  const handleManage = () => {
    dispatch.openPluginForm(plugin.id);
  };

  const handleUseInChat = async () => {
    try {
      /* The plugin must be selected AFTER the reset clears the composer
         selection (session/recents.js clears both surfaces). A false result
         means the user cancelled the new-session confirmation. */
      const resetResult = await getLegacyActions().navigation.startNewChat();
      if (resetResult === false) return;
      toggleComposerPlugin('topic', {
        id: plugin.id,
        name: plugin.name,
        description: plugin.description || '',
        capabilities: capabilities,
        authType: plugin.authType || 'oauth',
        configured: true,
        connectionStatus: 'connected',
        source: 'project',
      }, getConnectorIconMarkup(plugin.id) || '');
      focusComposer('topic');
    } catch {
      // best effort — worst case the user lands on a plain new chat
    }
  };

  return (
    <div className="workspace-surface plugin-detail-view" aria-labelledby="plugin-detail-title">
      <div className="plugin-detail-nav">
        <button
          type="button"
          className="plugin-detail-back-btn"
          onClick={handleBack}
          aria-label={i18n('plugins.detail.back', 'Back to plugins')}
        >
          <BackIcon />
          <span>{i18n('plugins.detail.backLabel', 'Plugins')}</span>
        </button>
      </div>

      <div className="plugin-detail-hero">
        <div className={'plugin-detail-logo-tile connector-icon connector-' + plugin.id}>
          {renderMark(plugin.id, plugin.name)}
        </div>
        <div className="plugin-detail-hero-content">
          <div className="plugin-detail-title-row">
            <h2 id="plugin-detail-title">{plugin.name}</h2>
          </div>
          <div className="plugin-detail-status-row">
            {isConnected ? (
              <span className="plugin-detail-status-pill connected">● {i18n('plugins.detail.connected', 'Connected')}</span>
            ) : connectable ? (
              <span className="plugin-detail-status-pill">{i18n('plugins.detail.notConnected', 'Not connected')}</span>
            ) : (
              <span className="plugin-detail-status-pill">{i18n('plugins.detail.unavailable', 'Unavailable')}</span>
            )}
            {plugin.connection?.displayName ? (
              <span className="plugin-detail-status-pill">{plugin.connection.displayName}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="plugin-detail-cta-bar">
        {isConnected ? (
          <div className="plugin-detail-cta-group">
            <button
              type="button"
              className="plugin-detail-btn-primary"
              onClick={() => void handleUseInChat()}
            >
              {i18n('plugins.detail.useInChat', 'Use in chat')}
            </button>
            <button
              type="button"
              className="plugin-detail-btn-secondary"
              onClick={handleManage}
            >
              {i18n('plugins.detail.manage', 'Manage')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="plugin-detail-btn-primary"
            disabled={!connectable}
            onClick={handleConnect}
          >
            {connectable ? i18n('plugins.detail.connect', 'Install & connect') : i18n('plugins.detail.unavailable', 'Unavailable')}
          </button>
        )}
      </div>

      <div className="plugin-detail-body">
        <section className="plugin-detail-section">
          <h3 className="plugin-detail-section-title">{i18n('plugins.detail.about', 'About')}</h3>
          <p className="plugin-detail-desc">
            {plugin.description || i18n('plugins.noDescription', 'Use this app in chat')}
          </p>
        </section>

        <section className="plugin-detail-section">
          <h3 className="plugin-detail-section-title">{i18n('plugins.detail.capabilities', 'Capabilities')}</h3>
          {capabilities.length ? (
            <ul className="plugin-detail-features-list">
              {capabilities.map((capability, idx) => (
                <li key={idx} className="plugin-detail-feature-item">
                  <span className="plugin-detail-feature-icon" aria-hidden="true">
                    <CheckIcon />
                  </span>
                  <span>{capability}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="plugin-detail-desc">{i18n('plugins.detail.noCaps', 'No published capabilities.')}</p>
          )}
        </section>

        <section className="plugin-detail-section">
          <h3 className="plugin-detail-section-title">{i18n('plugins.detail.auth', 'Authorization')}</h3>
          <div className="plugin-detail-security-card">
            <div className="plugin-detail-security-field">
              <span className="plugin-detail-security-label">{i18n('plugins.detail.authType', 'Auth type')}</span>
              <span className="plugin-detail-security-value">{authTypeLabel(plugin.authType)}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
