import { useRef, useState } from 'react';
import { Icon } from '../../../legacy/Icon';
import { Button } from '../../ui/shadcn/button';
import { i18n } from './workspaceUi';
import { getLegacyActions } from '../../legacy/gateway.ts';
import { PageCollectionCard, PageShell } from '../../layout/PageShell';
import { focusComposer, setComposerMarkdown } from '../../composer-input';
import { toggleComposerPlugin } from '../../../composer/pluginSelection.ts';
import { getConnectorIconMarkup } from '../../../connector-icons';
import type { PluginDetailViewProps } from './pluginDetail.types';
import { PluginDetailHeader } from './PluginDetailHeader';
import { PluginDetailSections } from './PluginDetailSections';
import { detailText, pluginDescription } from './pluginDetailContent';
import { showToast } from '../../../legacy/toast.ts';
import { reportSwallow as reportEmptyCatch } from '../../../util/reportSwallow.ts';

export function PluginDetailView({
  plugin,
  configured,
  dispatch,
  onBack,
  renderMark,
}: PluginDetailViewProps) {
  const isConnected = plugin.connection?.status === 'connected';
  const isOpenConnector = plugin.id.startsWith('oc_');
  const connectable = plugin.available !== false && (isOpenConnector || configured);
  const capabilities = Array.isArray(plugin.capabilities)
    ? plugin.capabilities.filter(Boolean)
    : [];

  const canUseInChat = isConnected && connectable && Boolean(plugin.chatActions?.length);
  const launchInFlight = useRef(false);
  const [launching, setLaunching] = useState(false);

  const handleConnect = () => {
    if (plugin.authType === 'api_key' || plugin.authType === 'custom_credential') {
      dispatch.openPluginForm(plugin.id);
    } else {
      dispatch.connectPlugin(plugin.id);
    }
  };

  const handleManage = () => dispatch.openPluginForm(plugin.id);

  const handleUseInChat = async (prompt?: string) => {
    if (!canUseInChat || launchInFlight.current) return;
    launchInFlight.current = true;
    setLaunching(true);
    try {
      /* Reset first because starting a new chat clears the composer plugin
         selection. A false result means the user cancelled confirmation. */
      const resetResult = await getLegacyActions().navigation.startNewChat();
      if (resetResult === false) return;
      toggleComposerPlugin(
        'topic',
        {
          id: plugin.id,
          name: plugin.name,
          description: pluginDescription(plugin),
          capabilities: plugin.chatActions?.map((action) => action.description) ?? capabilities,
          authType: plugin.authType || 'oauth',
          configured: true,
          connectionStatus: 'connected',
          source: 'project',
        },
        getConnectorIconMarkup(plugin.id) || '',
      );
      if (prompt) setComposerMarkdown('topic', prompt);
      focusComposer('topic');
    } catch (error) {
      reportEmptyCatch(
        error,
        'empty catch: react/pages/workspace/PluginDetailView.tsx',
        'expected',
      );
      showToast(
        detailText(
          'Could not open this app in chat. Please try again.',
          '无法在对话中打开此插件，请重试。',
        ),
        { variant: 'error' },
      );
    } finally {
      launchInFlight.current = false;
      setLaunching(false);
    }
  };

  return (
    <PageShell
      titleId="plugin-detail-title"
      hideHeader
      maxWidth="reading"
      className="workspace-surface plugin-detail-view"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="plugin-detail-back-btn w-fit"
        onClick={onBack}
        aria-label={i18n('plugins.detail.back', 'Back to plugins')}
      >
        <Icon name="chevronLeft" size={18} />
        <span>{i18n('plugins.detail.backLabel', 'Plugins')}</span>
      </Button>
      <PageCollectionCard className="plugin-detail-card">
        <PluginDetailHeader
          plugin={plugin}
          connectable={connectable}
          isConnected={isConnected}
          canUseInChat={canUseInChat}
          launching={launching}
          renderMark={renderMark}
          onConnect={handleConnect}
          onManage={handleManage}
          onRefresh={() => dispatch.refreshPlugin(plugin.id)}
          onUseInChat={() => {
            void handleUseInChat();
          }}
        />
        <PluginDetailSections
          plugin={plugin}
          capabilities={capabilities}
          connectable={connectable}
          launching={launching}
          onUseExample={
            canUseInChat
              ? (prompt) => {
                  void handleUseInChat(prompt);
                }
              : undefined
          }
        />
      </PageCollectionCard>
    </PageShell>
  );
}

export type { PluginDetailViewProps, WorkspacePluginBasic } from './pluginDetail.types';
