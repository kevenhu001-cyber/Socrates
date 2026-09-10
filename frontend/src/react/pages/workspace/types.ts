export interface WorkspaceSnapshot {
  activePage: 'library' | 'projects' | 'plugins' | null;
  libraryData: { files: ReadonlyArray<LibraryItem>; artifacts: ReadonlyArray<LibraryItem>; tab: 'files' | 'artifacts'; query: string; selection: Readonly<Record<string, boolean>>; renameItem: string | null };
  projectsData: ReadonlyArray<ProjectItem>;
  pluginsData: ReadonlyArray<PluginItem>;
  projectConnectorConfigured: boolean;
  openConnectorAvailable: boolean;
  mcpData: ReadonlyArray<McpServerItem>;
  mcpConfigured: boolean;
  mcpProjectId: string | null;
  loading: boolean;
  error: string | null;
  revision: number;
}

export interface LibraryItem { id: string; name?: string; title?: string; kind?: string; size?: number; uploadedAt?: string; updatedAt?: string; mimeType?: string; source?: string; }
export interface ProjectItem { id: string; name: string; description?: string; color?: string; systemPrompt?: string; }
export interface PluginItem { id: string; name: string; description?: string; capabilities?: string[]; authType?: string; connection?: { status?: string; displayName?: string } | null; credentialInput?: { fields: Array<{ key: string; label: string; type?: string; required?: boolean; help?: string }> }; available?: boolean }
export interface McpServerItem { key: string; name: string; description?: string; endpointHost?: string; enabled?: boolean; scope?: 'global' | 'project'; healthStatus?: string; lastError?: string | null; lastCheckedAt?: string | null; }

export interface WorkspaceBridge {
  getSnapshot: () => WorkspaceSnapshot;
  publish: (snapshot: Omit<WorkspaceSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesWorkspaceBridge?: WorkspaceBridge;
    __socratesMountWorkspace?: (page: string) => void;
    switchLibraryTab?: (tab: string) => void;
    filterLibrary?: (query: string) => void;
    openLibraryItem?: (id: string, kind: string, collection?: string) => void;
    toggleLibrarySelect?: (id: string, checked: boolean) => void;
    toggleSelectAllLibrary?: (checked: boolean) => void;
    deleteSelectedLibrary?: () => void;
    startLibraryRename?: (id: string, key: string) => void;
    cancelLibraryRename?: () => void;
    saveLibraryRename?: (input: HTMLInputElement) => void;
    deleteLibraryFile?: (id: string) => void;
    renameArtifact?: (id: string) => void;
    openCreateProject?: () => void;
    openEditProject?: (id: string) => void;
    openProjectWorkspace?: (id: string) => void;
    connectProjectConnector?: (id: string) => void;
    refreshProjectConnector?: (id: string) => void;
    openProjectConnectorForm?: (id: string) => void;
    openArxivSearch?: () => void;
    openZoteroLibrary?: () => void;
    ensureSlashApps?: () => void;
    esc?: (value: unknown) => string;
    escapeHtml?: (s: string) => string;
    apiFetch?: (path: string, options?: Record<string, unknown>) => Promise<unknown>;
    showToast?: (msg: string) => void;
    confirmAction?: (title: string, msg: string) => Promise<boolean>;
  }
}
