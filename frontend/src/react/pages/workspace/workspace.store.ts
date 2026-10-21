import { create } from 'zustand';
import type { WorkspacePage } from '../../../sidebar/navigation.destinations';
import type { LibraryItem, PluginItem, ProjectItem, WorkspaceSnapshot } from './types';

export type WorkspaceState = WorkspaceSnapshot;

const INITIAL: WorkspaceState = {
  libraryData: { files: [], artifacts: [], tab: 'files', query: '', selection: {}, renameItem: null },
  projectsData: [],
  pluginsData: [],
  projectConnectorConfigured: false,
  openConnectorAvailable: false,
  loadingByPage: { library: false, projects: false, plugins: false },
};

export const useWorkspaceStore = create<WorkspaceState>(() => INITIAL);

export function patchLibraryData(patch: Partial<WorkspaceState['libraryData']>): void {
  useWorkspaceStore.setState((state) => ({ libraryData: { ...state.libraryData, ...patch } }));
}

export function setLibraryCollections(files: ReadonlyArray<LibraryItem>, artifacts: ReadonlyArray<LibraryItem>): void {
  patchLibraryData({ files: [...files], artifacts: [...artifacts] });
}

export function setWorkspaceProjects(projects: ReadonlyArray<ProjectItem>): void {
  useWorkspaceStore.setState({ projectsData: [...projects] });
}

export function setWorkspacePlugins(
  plugins: ReadonlyArray<PluginItem>,
  options: { projectConnectorConfigured: boolean; openConnectorAvailable: boolean },
): void {
  useWorkspaceStore.setState({
    pluginsData: [...plugins],
    projectConnectorConfigured: options.projectConnectorConfigured,
    openConnectorAvailable: options.openConnectorAvailable,
  });
}

/** Independent loading flags prevent one page's request from blanking another. */
export function setWorkspaceLoading(page: WorkspacePage, loading: boolean): void {
  useWorkspaceStore.setState((state) => ({
    loadingByPage: { ...state.loadingByPage, [page]: loading },
  }));
}
