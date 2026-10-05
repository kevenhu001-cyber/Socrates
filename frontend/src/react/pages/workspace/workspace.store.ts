import { create } from 'zustand';
import type { LibraryItem, PluginItem, ProjectItem, WorkspaceSnapshot } from './types';

export type WorkspaceState = Omit<WorkspaceSnapshot, 'revision'>;

const INITIAL: WorkspaceState = {
  activePage: null,
  libraryData: { files: [], artifacts: [], tab: 'files', query: '', selection: {}, renameItem: null },
  projectsData: [],
  pluginsData: [],
  projectConnectorConfigured: false,
  openConnectorAvailable: false,
  mcpData: [],
  mcpConfigured: false,
  mcpProjectId: null,
  loading: false,
  error: null,
};

interface WorkspaceStore extends WorkspaceState {
  publish: (snapshot: WorkspaceState) => void;
  updateLibrary: (update: (current: WorkspaceState['libraryData']) => WorkspaceState['libraryData']) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  ...INITIAL,
  publish: (snapshot) => set({ ...snapshot }),
  updateLibrary: (update) => set((state) => ({ libraryData: update(state.libraryData) })),
}));

export function publishWorkspaceSnapshot(snapshot: WorkspaceState): void {
  useWorkspaceStore.getState().publish(snapshot);
}

export function patchWorkspaceSnapshot(patch: Partial<WorkspaceState>): void {
  useWorkspaceStore.setState(patch);
}

export function patchLibraryData(patch: Partial<WorkspaceState['libraryData']>): void {
  useWorkspaceStore.getState().updateLibrary((current) => ({ ...current, ...patch }));
}

export function setLibraryCollections(files: ReadonlyArray<LibraryItem>, artifacts: ReadonlyArray<LibraryItem>): void {
  patchLibraryData({ files: [...files], artifacts: [...artifacts] });
}

export function setWorkspaceProjects(projects: ReadonlyArray<ProjectItem>): void {
  useWorkspaceStore.setState({ projectsData: [...projects] });
}

export function setWorkspacePlugins(
  plugins: ReadonlyArray<PluginItem>,
  options: { projectConnectorConfigured: boolean; openConnectorAvailable: boolean; mcpProjectId: string | null },
): void {
  useWorkspaceStore.setState({
    pluginsData: [...plugins],
    projectConnectorConfigured: options.projectConnectorConfigured,
    openConnectorAvailable: options.openConnectorAvailable,
    mcpData: [],
    mcpConfigured: false,
    mcpProjectId: options.mcpProjectId,
  });
}
