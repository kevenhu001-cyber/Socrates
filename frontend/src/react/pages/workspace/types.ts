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
export interface ProjectItem { id: string; name: string; description?: string; color?: string; systemPrompt?: string; createdAt?: string | number; updatedAt?: string | number; created_at?: string | number; updated_at?: string | number; shared?: boolean; isShared?: boolean; visibility?: string; }
export interface PluginItem { id: string; name: string; description?: string; capabilities?: string[]; authType?: string; connection?: { status?: string; displayName?: string; connectionName?: string; updatedAt?: string; lastError?: string | null } | null; credentialInput?: { fields: Array<{ key: string; label: string; type?: string; required?: boolean; help?: string }> }; available?: boolean }
export interface McpServerItem { key: string; name: string; description?: string; endpointHost?: string; enabled?: boolean; scope?: 'global' | 'project'; healthStatus?: string; lastError?: string | null; lastCheckedAt?: string | null; }

declare global {
  interface Window {
    ensureSlashApps?: () => void;
  }
}
