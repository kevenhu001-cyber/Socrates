import type React from 'react';
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
