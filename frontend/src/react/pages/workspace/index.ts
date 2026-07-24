export { mountWorkspacePage, unmountWorkspacePage } from './WorkspacePage';
export { installWorkspaceBridge, getWorkspaceSnapshot, subscribeToWorkspace } from './workspaceStore';
export { useWorkspaceDispatch, useWorkspaceSnapshot } from './legacyAdapter';
export type {
  WorkspaceSnapshot,
  WorkspaceBridge,
  LibraryItem,
  ProjectItem,
  PluginItem,
} from './types';
