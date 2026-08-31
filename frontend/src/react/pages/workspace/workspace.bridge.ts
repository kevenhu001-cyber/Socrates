/**
 * Workspace page bridge — M2 single-bridge migration.
 *
 * The workspace pages (library / projects / plugins) publish snapshot
 * updates through `window.__socratesWorkspaceBridge.publish(...)`.
 * The factory owns the snapshot/reducer/listener loop; this module
 * adds the legacy alias and the React hooks consumed by
 * `WorkspacePage.tsx`.
 */

import { createImmutableBridge, useBridge } from '../../../lib/bridge';
import { getLegacyActions } from '../../legacy/gateway';
import type {
  WorkspaceBridge,
  WorkspaceSnapshot,
} from './types';

declare global {
  interface Window {
    __socratesWorkspaceBridge?: WorkspaceBridge;
  }
}

const INITIAL: WorkspaceSnapshot = {
  activePage: null,
  libraryData: {
    files: [],
    artifacts: [],
    tab: 'files',
    query: '',
    selection: {},
    renameItem: null,
  },
  projectsData: [],
  pluginsData: [],
  projectConnectorConfigured: false,
  mcpData: [],
  mcpConfigured: false,
  mcpProjectId: null,
  loading: false,
  error: null,
  revision: 0,
};

type Action = Omit<WorkspaceSnapshot, 'revision'>;

function cloneLibraryData(d: WorkspaceSnapshot['libraryData']) {
  return {
    files: Object.freeze([...d.files]),
    artifacts: Object.freeze([...d.artifacts]),
    tab: d.tab,
    query: d.query,
    selection: Object.freeze({ ...d.selection }),
    renameItem: d.renameItem,
  };
}

const factoryBridge = createImmutableBridge<WorkspaceSnapshot, Action>({
  initial: INITIAL,
  reducer: (state, action) => ({
    ...action,
    libraryData: Object.freeze(cloneLibraryData(action.libraryData)),
    projectsData: Object.freeze([...action.projectsData]),
    pluginsData: Object.freeze([...action.pluginsData]),
    mcpData: Object.freeze([...action.mcpData]),
    revision: state.revision + 1,
  }),
});

const bridge: WorkspaceBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as WorkspaceBridge;

export function installWorkspaceBridge(): WorkspaceBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesWorkspaceBridge) {
      window.__socratesWorkspaceBridge = bridge;
    }
    return window.__socratesWorkspaceBridge;
  }
  return bridge;
}

export function getWorkspaceSnapshot(): WorkspaceSnapshot {
  return installWorkspaceBridge().getSnapshot();
}

export function subscribeToWorkspace(listener: () => void): () => void {
  return installWorkspaceBridge().subscribe(listener);
}

export function useWorkspaceSnapshot(): WorkspaceSnapshot {
  return useBridge(factoryBridge);
}

export function useWorkspaceDispatch() {
  const w = getLegacyActions().workspace;
  return {
    switchTab: (tab: string) => w.switchLibraryTab(tab),
    filter: (q: string) => w.filterLibrary(q),
    openItem: (id: string, kind: string, collection: string) => w.openLibraryItem(id, kind, collection),
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
    toggleCodexMcp: (key: string, enabled: boolean) => w.toggleCodexMcp(key, enabled),
    checkCodexMcpHealth: (key: string) => w.checkCodexMcpHealth(key),
    openArxiv: () => w.openArxivSearch(),
    openZotero: () => w.openZoteroLibrary(),
  };
}
