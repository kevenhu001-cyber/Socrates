import { getApiFetch, getLegacyActions } from '../../legacy/gateway.ts';
import { getCachedProjects, hasCachedProjects, refreshCachedProjects, setCachedProjects } from '../../../projects/projectCache.ts';
import { patchLibraryData, patchWorkspaceSnapshot, setLibraryCollections, setWorkspacePlugins, setWorkspaceProjects, useWorkspaceStore } from './workspace.store';
import type { LibraryItem, PluginItem } from './types';
import { stateStore } from '../../../state/store.js';

type ApiResponse<T> = T & { error?: string };
type JsonApi = (path: string, options?: Record<string, unknown>) => Promise<any>;

function api(): JsonApi {
  const request = getApiFetch();
  if (!request) throw new Error('The API client is not ready.');
  return request;
}

function toast(message: string): void {
  getLegacyActions().messages.showToast?.(message);
}

export async function loadLibraryData(): Promise<void> {
  const state = useWorkspaceStore.getState();
  if (!state.libraryData.files.length && !state.libraryData.artifacts.length) patchWorkspaceSnapshot({ loading: true, error: null });
  try {
    const request = api();
    const [files, artifacts] = await Promise.all([
      request('/api/files?limit=100') as Promise<ApiResponse<{ files?: LibraryItem[] }>>,
      request('/api/artifacts?limit=100') as Promise<ApiResponse<{ artifacts?: LibraryItem[] }>>,
    ]);
    setLibraryCollections(files.files || [], artifacts.artifacts || []);
    patchWorkspaceSnapshot({ loading: false, error: null });
  } catch (error) {
    setLibraryCollections([], []);
    patchWorkspaceSnapshot({ loading: false, error: null });
    const status = error && typeof error === 'object' ? (error as { status?: number }).status : undefined;
    toast(status === 401 ? 'Sign in to upload files and create artifacts.' : 'Your library could not be loaded. Try again.');
  }
}

export async function loadProjectsData(): Promise<void> {
  if (!hasCachedProjects()) patchWorkspaceSnapshot({ loading: true, error: null });
  try {
    await refreshCachedProjects(() => api()('/api/projects'));
    setWorkspaceProjects(getCachedProjects() as any[]);
    patchWorkspaceSnapshot({ loading: false, error: null });
  } catch (error) {
    // Preserve the last successful list while reporting the failed refresh.
    setWorkspaceProjects(getCachedProjects() as any[]);
    patchWorkspaceSnapshot({ loading: false, error: null });
    const status = error && typeof error === 'object' ? (error as { status?: number }).status : undefined;
    toast(status === 401 ? 'Sign in to create projects.' : 'Projects could not be loaded. Try again.');
  }
}

export async function loadPluginsData(): Promise<void> {
  if (!useWorkspaceStore.getState().pluginsData.length) patchWorkspaceSnapshot({ loading: true, error: null });
  try {
    const result = await api()('/api/project-connectors') as ApiResponse<{
      connectors?: PluginItem[];
      configured?: boolean;
      openConnector?: { available?: boolean; cloud?: boolean };
    }>;
    const projectId = stateStore.read('currentProjectId') as string | null;
    setWorkspacePlugins(result.connectors || [], {
      projectConnectorConfigured: Boolean(result.configured),
      openConnectorAvailable: Boolean(result.openConnector?.available || result.openConnector?.cloud),
      mcpProjectId: projectId || null,
    });
    patchWorkspaceSnapshot({ loading: false, error: null });
  } catch (error) {
    setWorkspacePlugins([], { projectConnectorConfigured: false, openConnectorAvailable: false, mcpProjectId: null });
    patchWorkspaceSnapshot({ loading: false, error: null });
    const status = error && typeof error === 'object' ? (error as { status?: number }).status : undefined;
    toast(status === 401 ? 'Sign in to connect apps.' : 'Apps could not be loaded. Try again.');
  }
}

export function updateLibrarySelection(id: string, checked: boolean): void {
  const selection = { ...useWorkspaceStore.getState().libraryData.selection };
  if (checked) selection[id] = true;
  else delete selection[id];
  patchLibraryData({ selection });
}

export function toggleLibrarySelectionForCurrentTab(checked: boolean): void {
  const { libraryData } = useWorkspaceStore.getState();
  const items = libraryData[libraryData.tab];
  const selection = { ...libraryData.selection };
  items.forEach((item) => { if (checked) selection[item.id] = true; else delete selection[item.id]; });
  patchLibraryData({ selection });
}

export function updateLibraryRename(id: string | null): void {
  patchLibraryData({ renameItem: id });
}

export function updateLibrarySearch(query: string): void {
  patchLibraryData({ query });
}

export function updateLibraryTab(tab: string): void {
  patchLibraryData({ tab: tab === 'artifacts' ? 'artifacts' : 'files' });
}

export function getWorkspaceLibraryItem(id: string, collection: string): LibraryItem | null {
  const data = useWorkspaceStore.getState().libraryData;
  const rows = collection === 'artifacts' ? data.artifacts : data.files;
  return rows.find((item) => item.id === id) || null;
}

export async function removeLibraryItems(ids: string[], collection: 'files' | 'artifacts'): Promise<void> {
  const label = collection;
  try {
    await Promise.all(ids.map((id) => api()(`/api/${label}/${encodeURIComponent(id)}`, { method: 'DELETE' })));
    patchLibraryData({ selection: {} });
    toast(ids.length + ' ' + label + ' deleted');
    await loadLibraryData();
  } catch {
    toast('Could not delete some items');
  }
}

export async function saveLibraryItemRename(id: string, collection: 'files' | 'artifacts', name: string): Promise<void> {
  const rows = useWorkspaceStore.getState().libraryData[collection];
  const item = rows.find((entry) => entry.id === id);
  const oldName = item ? (item.name || item.title || '') : '';
  const newName = name.trim();
  updateLibraryRename(null);
  if (!newName || newName === oldName) return;
  try {
    await api()('/api/' + collection + '/' + encodeURIComponent(id), {
      method: 'PATCH', body: collection === 'files' ? { name: newName } : { title: newName },
    });
    const updated = rows.map((entry) => entry.id !== id ? entry : collection === 'files' ? { ...entry, name: newName } : { ...entry, title: newName });
    patchLibraryData(collection === 'files' ? { files: updated } : { artifacts: updated });
    toast('Renamed');
  } catch {
    toast('Could not rename');
  }
}

export async function uploadLibraryFiles(files: FileList | File[]): Promise<void> {
  const selected = Array.from(files);
  if (!selected.length) return;
  try {
    for (const file of selected) {
      const body = new FormData();
      body.append('file', file);
      await api()('/api/files', { method: 'POST', body });
    }
    toast(selected.length === 1 ? 'File added to Library' : selected.length + ' files added to Library');
    await loadLibraryData();
  } catch {
    toast('Some files could not be uploaded');
  }
}

export async function deleteLibraryFile(id: string): Promise<void> {
  try {
    await api()('/api/files/' + encodeURIComponent(id), { method: 'DELETE' });
    await loadLibraryData();
    toast('File deleted');
  } catch {
    toast('Could not delete file');
  }
}

export async function saveProjectRecord(projectId: string | null, data: Record<string, unknown>): Promise<void> {
  try {
    const saved = projectId
      ? await api()('/api/projects/' + encodeURIComponent(projectId), { method: 'PATCH', body: data })
      : await api()('/api/projects', { method: 'POST', body: data });
    const current = [...getCachedProjects()];
    const record = saved && typeof saved === 'object' && 'project' in saved ? (saved as { project: any }).project : saved;
    if (projectId) setCachedProjects(current.map((project) => project.id === projectId ? { ...project, ...record } : project));
    else if (record && typeof record.id === 'string') setCachedProjects([...current, record]);
    setWorkspaceProjects(getCachedProjects() as any[]);
    toast(projectId ? 'Project updated' : 'Project created');
  } catch {
    toast('Could not save project');
    throw new Error('project-save-failed');
  }
}

export async function deleteProjectRecord(id: string): Promise<void> {
  try {
    await api()('/api/projects/' + encodeURIComponent(id), { method: 'DELETE' });
    setCachedProjects(getCachedProjects().filter((project) => project.id !== id));
    setWorkspaceProjects(getCachedProjects() as any[]);
    toast('Project deleted');
  } catch {
    toast('Could not delete project');
  }
}

export async function connectProjectPlugin(id: string): Promise<void> {
  try {
    const result = await api()('/api/project-connectors/' + encodeURIComponent(id) + '/connect', { method: 'POST' });
    if (result && result.status === 'connected') {
      await loadPluginsData();
      toast('App connected');
      return;
    }
    if (!result || !result.authorizationUrl) throw new Error('No authorization URL was returned');
    const remember = (window as Window & { rememberConnectorReturnContext?: (connectorId: string) => void }).rememberConnectorReturnContext;
    remember?.(id);
    window.location.assign(result.authorizationUrl);
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not start authorization');
  }
}

export async function refreshProjectPlugin(id: string): Promise<void> {
  try {
    await api()('/api/project-connectors/' + encodeURIComponent(id) + '/status');
    await loadPluginsData();
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not refresh authorization status');
  }
}

export async function submitProjectPluginCredentials(id: string, body: Record<string, unknown>): Promise<void> {
  try {
    const result = await api()('/api/project-connectors/' + encodeURIComponent(id) + '/connect', { method: 'POST', body });
    if (!result || result.status !== 'connected') throw new Error(result?.error || 'Could not connect.');
    await loadPluginsData();
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not connect this app');
    throw error;
  }
}

export async function disconnectProjectPlugin(id: string, closeDialog?: () => void): Promise<void> {
  const confirmed = await getLegacyActions().confirm.showConfirm('Disconnect this app?', 'Socrates will remove the stored connection.', true);
  if (confirmed === false) return;
  try {
    await api()('/api/project-connectors/' + encodeURIComponent(id) + '/connection', { method: 'DELETE' });
    await loadPluginsData();
    closeDialog?.();
    toast('App disconnected');
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not disconnect app');
  }
}
