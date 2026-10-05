import { exitPluginsView } from '../../../sidebar/navigation.service';
import { getLegacyActions } from '../../legacy/gateway.ts';
import { patchLibraryData, useWorkspaceStore } from './workspace.store';
import { openArxivSearch, openLibraryItem, openProjectConnectorForm, openProjectForm, openProjectWorkspace, openZoteroLibrary } from './workspace.dialogs';
import {
  deleteLibraryFile,
  connectProjectPlugin,
  refreshProjectPlugin,
  removeLibraryItems,
  saveLibraryItemRename,
  toggleLibrarySelectionForCurrentTab,
  updateLibraryRename,
  updateLibrarySearch,
  updateLibrarySelection,
  updateLibraryTab,
} from './workspace.service';

export function useWorkspaceSnapshot() {
  return useWorkspaceStore();
}

export function useWorkspaceDispatch() {
  return {
    switchTab: (tab: string) => updateLibraryTab(tab),
    filter: (query: string) => updateLibrarySearch(query),
    openItem: openLibraryItem,
    toggleSelect: (id: string, checked: boolean) => updateLibrarySelection(id, checked),
    toggleSelectAll: (checked: boolean) => toggleLibrarySelectionForCurrentTab(checked),
    deleteSelected: async () => {
      const data = useWorkspaceStore.getState().libraryData;
      const ids = Object.keys(data.selection);
      if (!ids.length) return;
      const label = data.tab === 'files' ? 'files' : 'artifacts';
      const confirmed = await getLegacyActions().confirm.showConfirm(`Delete ${ids.length} ${label}?`, 'This cannot be undone.', true);
      if (confirmed === false) return;
      await removeLibraryItems(ids, data.tab);
    },
    startRename: (id: string, _key: string) => updateLibraryRename(id),
    cancelRename: () => updateLibraryRename(null),
    saveRename: (input: HTMLInputElement) => saveLibraryItemRename(input.dataset.renameId || '', input.dataset.renameKey === 'artifacts' ? 'artifacts' : 'files', input.value),
    deleteFile: async (id: string) => {
      const confirmed = await getLegacyActions().confirm.showConfirm('Delete this file?', 'It will be removed from your library.', true);
      if (confirmed === false) return;
      await deleteLibraryFile(id);
    },
    renameArtifact: (id: string) => updateLibraryRename(id),
    createProject: () => openProjectForm(),
    editProject: (id: string) => openProjectForm(id),
    openProject: openProjectWorkspace,
    connectPlugin: connectProjectPlugin,
    refreshPlugin: refreshProjectPlugin,
    openPluginForm: openProjectConnectorForm,
    exitPlugins: exitPluginsView,
    openArxiv: openArxivSearch,
    openZotero: openZoteroLibrary,
  };
}

export function setWorkspaceLibraryTab(tab: string): void {
  patchLibraryData({ tab: tab === 'artifacts' ? 'artifacts' : 'files' });
}
