import type React from 'react';
import type { useWorkspaceDispatch } from './workspace.hooks';
import type { PluginItem } from './types';

export type WorkspacePluginBasic = PluginItem;

export interface PluginDetailViewProps {
  plugin: WorkspacePluginBasic;
  configured: boolean;
  openConnectorAvailable: boolean;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
  onBack: () => void;
  renderMark: (id: string, name: string) => React.ReactNode;
}
