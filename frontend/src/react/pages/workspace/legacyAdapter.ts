import { useSyncExternalStore } from 'react';
import { getWorkspaceSnapshot, subscribeToWorkspace } from './workspaceStore';
import type { WorkspaceSnapshot } from './types';

export function useWorkspaceSnapshot(): WorkspaceSnapshot {
  return useSyncExternalStore(subscribeToWorkspace, getWorkspaceSnapshot, getWorkspaceSnapshot);
}

export function useWorkspaceDispatch() {
  return {
    switchTab: (tab: string) => { if (typeof window.switchLibraryTab === 'function') window.switchLibraryTab(tab); },
    filter: (q: string) => { if (typeof window.filterLibrary === 'function') window.filterLibrary(q); },
    openItem: (id: string, kind: string) => { if (typeof window.openLibraryItem === 'function') window.openLibraryItem(id, kind); },
    toggleSelect: (id: string, checked: boolean) => { if (typeof window.toggleLibrarySelect === 'function') window.toggleLibrarySelect(id, checked); },
    toggleSelectAll: (checked: boolean) => { if (typeof window.toggleSelectAllLibrary === 'function') window.toggleSelectAllLibrary(checked); },
    deleteSelected: () => { if (typeof window.deleteSelectedLibrary === 'function') window.deleteSelectedLibrary(); },
    startRename: (id: string, key: string) => { if (typeof window.startLibraryRename === 'function') window.startLibraryRename(id, key); },
    cancelRename: () => { if (typeof window.cancelLibraryRename === 'function') window.cancelLibraryRename(); },
    saveRename: (input: HTMLInputElement) => { if (typeof window.saveLibraryRename === 'function') window.saveLibraryRename(input); },
    deleteFile: (id: string) => { if (typeof window.deleteLibraryFile === 'function') window.deleteLibraryFile(id); },
    renameArtifact: (id: string) => { if (typeof window.renameArtifact === 'function') window.renameArtifact(id); },
    createProject: () => { if (typeof window.openCreateProject === 'function') window.openCreateProject(); },
    editProject: (id: string) => { if (typeof window.openEditProject === 'function') window.openEditProject(id); },
    openProject: (id: string) => { if (typeof window.openProjectWorkspace === 'function') window.openProjectWorkspace(id); },
    connectPlugin: (id: string) => { if (typeof window.connectProjectConnector === 'function') window.connectProjectConnector(id); },
    refreshPlugin: (id: string) => { if (typeof window.refreshProjectConnector === 'function') window.refreshProjectConnector(id); },
    openPluginForm: (id: string) => { if (typeof window.openProjectConnectorForm === 'function') window.openProjectConnectorForm(id); },
    openArxiv: () => { if (typeof window.openArxivSearch === 'function') window.openArxivSearch(); },
    openZotero: () => { if (typeof window.openZoteroLibrary === 'function') window.openZoteroLibrary(); },
  };
}
