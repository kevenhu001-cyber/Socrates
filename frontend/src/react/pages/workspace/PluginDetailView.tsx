import { useEffect } from 'react';
import { getLegacyActions } from '../../legacy/gateway.ts';
import { focusComposer } from '../../composer-input';
import { toggleComposerPlugin } from '../../composer/pluginSelection';
import { getConnectorIconMarkup } from '../../../connector-icons';
import type { PluginDetailViewProps } from './pluginDetail.types';
import { PluginDetailHeader } from './PluginDetailHeader';
import { PluginDetailSections } from './PluginDetailSections';

export function PluginDetailView({ plugin, configured, dispatch, onBack, renderMark }: PluginDetailViewProps) {
  const isConnected = plugin.connection?.status === 'connected';
  const isOpenConnector = plugin.id.startsWith('oc_');
  const connectable = plugin.available !== false && (isOpenConnector || configured);
  const capabilities = Array.isArray(plugin.capabilities) ? plugin.capabilities.filter(Boolean) : [];

  useEffect(() => {
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

  const handleManage = () => dispatch.openPluginForm(plugin.id);

  const handleUseInChat = async () => {
    try {
      /* Reset first because starting a new chat clears the composer plugin
         selection. A false result means the user cancelled confirmation. */
      const resetResult = await getLegacyActions().navigation.startNewChat();
      if (resetResult === false) return;
      toggleComposerPlugin('topic', {
        id: plugin.id,
        name: plugin.name,
        description: plugin.description || '',
        capabilities,
        authType: plugin.authType || 'oauth',
        configured: true,
        connectionStatus: 'connected',
        source: 'project',
      }, getConnectorIconMarkup(plugin.id) || '');
      focusComposer('topic');
    } catch {
      // Best effort; worst case the user lands on a plain new chat.
    }
  };

  return (
    <div className="workspace-surface plugin-detail-view" aria-labelledby="plugin-detail-title">
      <PluginDetailHeader
        plugin={plugin}
        connectable={connectable}
        isConnected={isConnected}
        renderMark={renderMark}
        onBack={handleBack}
        onConnect={handleConnect}
        onManage={handleManage}
        onUseInChat={() => { void handleUseInChat(); }}
      />
      <PluginDetailSections plugin={plugin} capabilities={capabilities} />
    </div>
  );
}

export type { PluginDetailViewProps, WorkspacePluginBasic } from './pluginDetail.types';
