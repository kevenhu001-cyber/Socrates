import type {
  WorkspaceBridge,
  WorkspaceSnapshot,
} from './types';

type Listener = () => void;

const INITIAL: WorkspaceSnapshot = {
  activePage: null,
  libraryData: { files: [], artifacts: [], tab: 'files', query: '', selection: {}, renameItem: null },
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

let snapshot: WorkspaceSnapshot = INITIAL;
const listeners = new Set<Listener>();

function cloneLibraryData(d: WorkspaceSnapshot['libraryData']) {
  return { files: Object.freeze([...d.files]), artifacts: Object.freeze([...d.artifacts]), tab: d.tab, query: d.query, selection: Object.freeze({ ...d.selection }), renameItem: d.renameItem };
}

function commit(next: Omit<WorkspaceSnapshot, 'revision'>): void {
  snapshot = Object.freeze({
    ...next,
    libraryData: Object.freeze(cloneLibraryData(next.libraryData)),
    projectsData: Object.freeze([...next.projectsData]),
    pluginsData: Object.freeze([...next.pluginsData]),
    mcpData: Object.freeze([...next.mcpData]),
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

function getSnapshot(): WorkspaceSnapshot { return snapshot; }
function publish(next: Omit<WorkspaceSnapshot, 'revision'>): void { commit(next); }
function subscribe(listener: Listener): () => void { listeners.add(listener); return () => listeners.delete(listener); }

const bridge: WorkspaceBridge = { getSnapshot, publish, subscribe };

export function installWorkspaceBridge(): WorkspaceBridge {
  const existing = window.__socratesWorkspaceBridge;
  if (existing) return existing;
  window.__socratesWorkspaceBridge = bridge;
  return bridge;
}

export function getWorkspaceSnapshot(): WorkspaceSnapshot { return installWorkspaceBridge().getSnapshot(); }
export function subscribeToWorkspace(listener: Listener): () => void { return installWorkspaceBridge().subscribe(listener); }
