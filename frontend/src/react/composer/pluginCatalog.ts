import { apiFetch } from '../../util/api.js';

export type PluginConnectionStatus =
  | 'connected'
  | 'initiated'
  | 'needs_installation'
  | 'error'
  | 'disconnected'
  | 'unavailable';

export interface PluginCatalogEntry {
  id: string;
  name: string;
  description: string;
  capabilities: ReadonlyArray<string>;
  authType: string;
  configured: boolean;
  connectionStatus: PluginConnectionStatus;
  displayName?: string;
  directiveTemplate?: string;
  source: 'project';
  credentialInput?: {
    fields: ReadonlyArray<{
      key: string;
      label: string;
      type?: string;
      required?: boolean;
      help?: string;
    }>;
  };
}

interface RawPluginEntry {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  capabilities?: unknown;
  authType?: unknown;
  configured?: unknown;
  connection?: {
    status?: unknown;
    displayName?: unknown;
  } | null;
  credentialInput?: PluginCatalogEntry['credentialInput'];
}

interface CatalogResponse {
  configured?: unknown;
  connectors?: RawPluginEntry[];
}

const DIRECTIVE_TEMPLATES: Record<string, string> = {
  github: "Use my connected GitHub context when relevant to the user's request.",
  gitee: "Use my connected Gitee context when relevant to the user's request.",
  notion: "Use my connected Notion workspace when relevant to the user's request.",
  gmail: "Use my connected Gmail context when relevant to the user's request.",
  googledrive: "Use my connected Google Drive context when relevant to the user's request.",
  googlecalendar: "Use my connected Google Calendar context when relevant to the user's request.",
  todoist: "Use my connected Todoist tasks when relevant to the user's request.",
  ticktick: "Use my connected TickTick tasks when relevant to the user's request.",
  discord: "Use my connected Discord context when relevant to the user's request.",
  tencentdocs: "Use my connected Tencent Docs when relevant to the user's request.",
  onedrive: "Use my connected OneDrive files when relevant to the user's request.",
  outlook: "Use my connected Outlook context when relevant to the user's request.",
  gitlab: "Use my connected GitLab context when relevant to the user's request.",
  qqmail: "Use my connected QQ Mail context when relevant to the user's request.",
  feishu: "Use my connected Feishu context when relevant to the user's request.",
};

export function normalisePluginId(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[_-]/g, '');
}

function connectionStatus(raw: RawPluginEntry): PluginConnectionStatus {
  const status = String(raw.connection?.status || '').toLowerCase();
  if (status === 'connected' || status === 'initiated' || status === 'needs_installation' || status === 'error') {
    return status;
  }
  if (raw.configured === false) return 'unavailable';
  return 'disconnected';
}

export function decoratePluginEntry(raw: RawPluginEntry, configuredOverride?: boolean): PluginCatalogEntry | null {
  const id = String(raw.id || '').trim();
  const name = String(raw.name || id).trim();
  if (!id || !name) return null;
  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const status = connectionStatus(raw);
  return {
    id,
    name,
    description: String(raw.description || '').trim(),
    capabilities,
    authType: String(raw.authType || 'oauth'),
    configured: configuredOverride ?? raw.configured !== false,
    connectionStatus: status,
    displayName: raw.connection?.displayName ? String(raw.connection.displayName) : undefined,
    directiveTemplate: DIRECTIVE_TEMPLATES[normalisePluginId(id)],
    source: 'project',
    credentialInput: raw.credentialInput,
  };
}

export function pluginDirective(entry: Pick<PluginCatalogEntry, 'name' | 'directiveTemplate' | 'capabilities'>): string {
  if (entry.directiveTemplate) return entry.directiveTemplate;
  const capabilityText = entry.capabilities.length ? ` (${entry.capabilities.join(', ')})` : '';
  return `Use my connected ${entry.name}${capabilityText} context when relevant to the user's request.`;
}

export function serializeSelectedPluginContext(
  entries: ReadonlyArray<Pick<PluginCatalogEntry, 'name' | 'directiveTemplate' | 'capabilities'>>,
  prompt: string,
): string {
  const trimmedPrompt = String(prompt || '').trim();
  if (!entries.length) return trimmedPrompt;
  const directives = entries.map(pluginDirective).join('\n');
  return `${directives}\n\n${trimmedPrompt}`.trim();
}

let catalogRequest: Promise<ReadonlyArray<PluginCatalogEntry>> | null = null;

export async function loadPluginCatalog(force = false): Promise<ReadonlyArray<PluginCatalogEntry>> {
  if (!force && catalogRequest) return catalogRequest;
  catalogRequest = apiFetch('/api/project-connectors')
    .then((payload) => {
      const response = (payload || {}) as CatalogResponse;
      const configured = response.configured !== false;
      return Object.freeze(
        (Array.isArray(response.connectors) ? response.connectors : [])
          .map((entry) => decoratePluginEntry(entry, configured && entry.configured !== false))
          .filter((entry): entry is PluginCatalogEntry => Boolean(entry)),
      );
    })
    .catch((error) => {
      catalogRequest = null;
      throw error;
    });
  return catalogRequest;
}

export function resetPluginCatalogForTests(): void {
  catalogRequest = null;
}

declare global {
  interface Window {
    getConnectorIconMarkup?: (id: string) => string;
  }
}

export function pluginIconMarkup(id: string): string {
  if (typeof window !== 'undefined' && typeof window.getConnectorIconMarkup === 'function') {
    return window.getConnectorIconMarkup(id) || '';
  }
  return '';
}
