import { useSyncExternalStore } from 'react';
import { getWorkspaceSnapshot, subscribeToWorkspace } from './workspaceStore';
import type { WorkspaceSnapshot } from './types';
import { getLegacyActions } from '../../legacy/gateway';

export function useWorkspaceSnapshot(): WorkspaceSnapshot {
  return useSyncExternalStore(subscribeToWorkspace, getWorkspaceSnapshot, getWorkspaceSnapshot);
}

export function useWorkspaceDispatch() {
  const w = getLegacyActions().workspace;
  return {
    switchTab: (tab: string) => w.switchLibraryTab(tab),
    filter: (q: string) => w.filterLibrary(q),
    openItem: (id: string, kind: string) => w.openLibraryItem(id, kind),
    toggleSelect: (id: string, checked: boolean) => w.toggleLibrarySelect(id, checked),
    toggleSelectAll: (checked: boolean) => w.toggleSelectAllLibrary(checked),
    deleteSelected: () => w.deleteSelectedLibrary(),
    startRename: (id: string, key: string) => w.startLibraryRename(id, key),
    cancelRename: () => w.cancelLibraryRename(),
    saveRename: (input: HTMLInputElement) => w.saveLibraryRename(input),
    deleteFile: (id: string) => w.deleteLibraryFile(id),
    renameArtifact: (id: string) => w.renameArtifact(id),
    createProject: () => w.openCreateProject(),
    editProject: (id: string) => w.openEditProject(id),
    openProject: (id: string) => w.openProjectWorkspace(id),
    connectPlugin: (id: string) => w.connectProjectConnector(id),
    refreshPlugin: (id: string) => w.refreshProjectConnector(id),
    openPluginForm: (id: string) => w.openProjectConnectorForm(id),
    openArxiv: () => w.openArxivSearch(),
    openZotero: () => w.openZoteroLibrary(),
  };
}
