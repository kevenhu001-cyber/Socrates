import { ConnectorError, ProjectConnector } from '@oomol-lab/connector';

/* A deliberately small, product-owned catalogue. The gateway owns OAuth,
 * credentials and the action schemas. Socrates owns which apps it exposes and
 * which actions it will later allow an agent to invoke.
 *
 * `authType` declares how the gateway expects end-user credentials:
 *   - 'oauth'             → standard OAuth2 redirect flow (project.connect.oauth)
 *   - 'api_key'           → user pastes a per-user upstream key (e.g. GitLab PAT) (project.connect.apiKey)
 *   - 'custom_credential' → user provides per-provider credential fields (project.connect.customCredential)
 *
 * `credentialInput.fields` describes the form the frontend must render for
 * non-OAuth auth types. Each field has key/label/type/required/help. The
 * backend never echoes raw credentials back; only opaque connection IDs. */
export const PROJECT_CONNECTOR_CATALOG = [
  { id: 'github',         service: 'github',         name: 'GitHub',       description: 'Bring repositories, issues, pull requests, and CI context into a chat.', capabilities: ['Repositories', 'Issues', 'Pull requests'], authType: 'oauth' },
  { id: 'feishu',         service: 'feishu',         name: 'Feishu',       description: 'Use documents and collaboration context from your Feishu account.', capabilities: ['Documents', 'Messages'], authType: 'oauth' },
  { id: 'gitee',          service: 'gitee',          name: 'Gitee',        description: 'Use repositories and issue context from your Gitee account.', capabilities: ['Repositories', 'Issues'], authType: 'oauth' },
  { id: 'gmail',          service: 'gmail',          name: 'Gmail',        description: 'Search mail context that you explicitly authorize.', capabilities: ['Mail search'], authType: 'oauth' },
  { id: 'notion',         service: 'notion',         name: 'Notion',       description: 'Search pages and knowledge you share with Socrates.', capabilities: ['Page search'], authType: 'oauth' },
  { id: 'googledrive',    service: 'googledrive',    name: 'Google Drive', description: 'Bring files and folders from your Google Drive into a chat.', capabilities: ['Files', 'Folders'], authType: 'oauth' },
  { id: 'googlecalendar', service: 'googlecalendar', name: 'Google Calendar', description: 'Use your schedule and event context when planning study sessions.', capabilities: ['Events'], authType: 'oauth' },
  { id: 'todoist',        service: 'todoist',        name: 'Todoist',      description: 'Use your task list as study context.', capabilities: ['Tasks'], authType: 'oauth' },
  { id: 'ticktick',       service: 'ticktick',       name: 'TickTick',     description: 'Pull tasks from TickTick into study context.', capabilities: ['Tasks'], authType: 'oauth' },
  { id: 'discord',        service: 'discord',        name: 'Discord',      description: 'Use channel and message context from Discord servers you belong to.', capabilities: ['Channels', 'Messages'], authType: 'oauth' },
  { id: 'tencent_docs',   service: 'tencent_docs',   name: 'Tencent Docs', description: 'Pull online documents from Tencent Docs into a chat.', capabilities: ['Documents'], authType: 'oauth' },
  { id: 'one_drive',      service: 'one_drive',      name: 'OneDrive',     description: 'Bring files from your Microsoft OneDrive into a chat.', capabilities: ['Files'], authType: 'oauth' },
  { id: 'outlook',        service: 'outlook',        name: 'Outlook',      description: 'Search your Outlook mailbox when email context is needed.', capabilities: ['Mail search'], authType: 'oauth' },
  { id: 'gitlab', service: 'gitlab', name: 'GitLab', description: 'Bring repositories, issues, and pull requests from GitLab into a chat.', capabilities: ['Repositories', 'Issues', 'Pull requests'], authType: 'api_key', credentialInput: { fields: [
    { key: 'apiKey', label: 'GitLab Personal Access Token', type: 'password', required: true, help: 'Create one at GitLab → User Settings → Access Tokens with the api scope.' },
  ] } },
  { id: 'qq_mail', service: 'qq_mail', name: 'QQ Mail', description: 'Search mail context from your QQ Mail account.', capabilities: ['Mail search'], authType: 'custom_credential', credentialInput: { fields: [
    { key: 'email',    label: 'QQ Mail address',           type: 'email',    required: true },
    { key: 'authCode', label: 'Authorization code',        type: 'password', required: true, help: 'Use a QQ Mail IMAP/POP3 authorization code, not your account password.' },
  ] } },
];

const byId = new Map(PROJECT_CONNECTOR_CATALOG.map((item) => [item.id, item]));
let client: ProjectConnector | undefined;

export function isProjectConnectorConfigured() {
  return Boolean(process.env.OOMOL_PROJECT_API_KEY);
}

/* Optional per-service provider-config override for OOMOL-cloud mode.
 *
 * Docs (connector-saas) recommend passing providerConfigId in production,
 * and the gateway REQUIRES it when one service has multiple provider
 * configs (`multiple_provider_configs_found`, e.g. two Linear OAuth apps).
 * Services with a single config keep resolving by `service` unchanged.
 *
 * Configure on the host (same env file as OOMOL_PROJECT_API_KEY):
 *   OC_CLOUD_PROVIDER_CONFIG_IDS='{"linear":"pc-...","slack":"pc-..."}'
 * Keys are matched case-insensitively against the ocService. Values are
 * provider config IDs from the OOMOL console provider-configs page —
 * identifiers, not secrets, but keep them with the other env config. */
export function cloudProviderConfigId(service: unknown): string | null {
  const raw = process.env.OC_CLOUD_PROVIDER_CONFIG_IDS || '';
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const hit = (parsed as Record<string, unknown>)[String(service || '').toLowerCase()]
      ?? (Object.entries(parsed as Record<string, unknown>)
        .find(([k]) => k.toLowerCase() === String(service || '').toLowerCase())?.[1]);
    return typeof hit === 'string' && hit ? hit : null;
  } catch {
    return null;
  }
}

/* Exactly-one provider selector for cloud connect calls: explicit
 * providerConfigId when mapped, otherwise the service id. The gateway
 * rejects both-present, so the two shapes never mix. */
export function cloudProviderSelector(service: string): { providerConfigId: string } | { service: string } {
  const providerConfigId = cloudProviderConfigId(service);
  return providerConfigId ? { providerConfigId } : { service };
}

export function getProjectConnector() {
  if (!isProjectConnectorConfigured()) return null;
  if (!client) {
    client = new ProjectConnector({
      apiKey: process.env.OOMOL_PROJECT_API_KEY as string,
      baseUrl: process.env.OOMOL_PROJECT_CONNECTOR_BASE_URL || undefined,
      timeoutMs: 30_000,
      maxRetries: 2,
    });
  }
  return client;
}

export function getProjectConnectorProvider(id: unknown) {
  return byId.get(String(id || '').toLowerCase()) || null;
}

export function externalUserId(userId: unknown) {
  /* Keep this stable and opaque. It is the tenant boundary at OOMOL. */
  return String(userId);
}

export function connectorErrorPayload(error: unknown) {
  if (error instanceof ConnectorError) {
    /* The gateway puts the actionable reason in the upstream body
     * (data.errorCode/errorMessage, e.g. `provider_config_not_found`
     * when the provider is not provisioned in the OOMOL console).
     * Prefer it over the collapsed `provider_error` shell so the UI
     * can tell the user what to fix. */
    const data = (error.data || {}) as {
      errorCode?: unknown; errorMessage?: unknown;
      error?: string | { code?: unknown; message?: unknown };
    };
    const nested = typeof data.error === 'object' && data.error !== null ? data.error : null;
    const code = data.errorCode || nested?.code || error.code;
    const message = data.errorMessage || (typeof data.error === 'string' ? data.error : nested?.message) || error.message;
    return {
      status: error.status || 502,
      code: typeof code === 'string' && code ? code : 'connector_error',
      message: typeof message === 'string' && message ? message : 'Connector request failed',
    };
  }
  return { status: 502, code: 'connector_error', message: (error as { message?: string })?.message || 'Connector request failed' };
}
