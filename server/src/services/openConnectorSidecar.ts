/* HTTP client for the vendored OpenConnector sidecar.
 *
 * The sidecar (open-connector/, Apache-2.0) runs as its own process and owns
 * provider metadata, credential storage and action execution. Socrates never
 * imports it; everything here goes over localhost HTTP.
 *
 * Multi-user mapping: the sidecar keys connections by (service,
 * connectionName), so each Socrates user gets a namespaced connectionName.
 * Nothing credential-like is persisted on the Socrates side beyond opaque
 * connection rows; secrets stay inside the sidecar's store.
 *
 * Env:
 *   OC_SIDECAR_URL            → sidecar origin (default http://127.0.0.1:3101)
 *   OC_SIDECAR_ADMIN_TOKEN    → Bearer token for /api management calls
 *   OC_SIDECAR_RUNTIME_TOKEN  → Bearer token for /v1 runtime calls
 */

export interface SidecarAuthField {
  key: string;
  label: string;
  inputType?: string;
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  description?: string;
}

export interface SidecarAuthConfig {
  type: string;
  label?: string;
  placeholder?: string;
  description?: string;
  fields?: SidecarAuthField[];
}

export interface SidecarProvider {
  service: string;
  displayName: string;
  categories: string[];
  authTypes: string[];
  auth: SidecarAuthConfig[];
  homepageUrl?: string | null;
  iconUrl?: string | null;
  actions: Array<{ id: string; name: string; description?: string }>;
}

export interface SidecarConnectionStatus {
  connected: boolean;
  connectionName: string | null;
  displayName: string | null;
}

export class SidecarError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'SidecarError';
    this.status = status;
    this.code = code;
  }
}

function baseUrl() {
  return (process.env.OC_SIDECAR_URL || 'http://127.0.0.1:3101').replace(/\/+$/, '');
}

function adminToken() {
  return process.env.OC_SIDECAR_ADMIN_TOKEN || '';
}

function runtimeToken() {
  return process.env.OC_SIDECAR_RUNTIME_TOKEN || '';
}

export function parseSidecarError(status: number, data: unknown): SidecarError {
  /* The sidecar uses two failure shapes: flat runtime envelopes
   * ({message, errorCode}) and wrapped errors ({error: {code, message}}). */
  const body = (data || {}) as {
    message?: string; errorCode?: string; code?: string;
    error?: string | { code?: string; message?: string };
  };
  const nested = typeof body.error === 'object' && body.error !== null ? body.error : null;
  return new SidecarError(
    status,
    body.errorCode || body.code || nested?.code || 'sidecar_error',
    body.message || (typeof body.error === 'string' ? body.error : nested?.message) || `Sidecar request failed with status ${status}`,
  );
}
async function sidecarFetch(path: string, options: {
  method?: string;
  body?: unknown;
  token?: string;
  timeoutMs?: number;
}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await fetch(baseUrl() + path, {
      method: options.method || 'GET',
      headers: {
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw parseSidecarError(response.status, data);
    return data;
  } catch (error) {
    if (error instanceof SidecarError) throw error;
    const message = error instanceof Error ? error.message : 'Sidecar request failed';
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new SidecarError(503, aborted ? 'sidecar_timeout' : 'sidecar_unreachable', message);
  } finally {
    clearTimeout(timer);
  }
}

/* connectionName must satisfy the sidecar's rule: start alnum, then
 * [a-zA-Z0-9_-], max 64 chars. Socrates user ids are UUIDs, so the
 * namespaced form always fits; anything else is sanitized defensively. */
export function connectionNameForUser(userId: unknown): string {
  const raw = String(userId || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  const name = `socrates-${raw || 'anon'}`.slice(0, 64).replace(/-+$/, '');
  return /^[a-z0-9][a-zA-Z0-9_-]{0,63}$/.test(name) ? name : 'socrates-anon';
}

let providerCache: { at: number; providers: SidecarProvider[] } | null = null;
const PROVIDER_CACHE_TTL_MS = 60_000;

export async function listSidecarProviders(): Promise<SidecarProvider[]> {
  if (providerCache && Date.now() - providerCache.at < PROVIDER_CACHE_TTL_MS) return providerCache.providers;
  const data = await sidecarFetch('/api/providers', { timeoutMs: 15_000 });
  const providers = (Array.isArray(data) ? data : []) as SidecarProvider[];
  providerCache = { at: Date.now(), providers };
  return providers;
}

export function isOpenConnectorSidecarConfigured(): boolean {
  return Boolean(adminToken() || process.env.OC_SIDECAR_URL);
}

function requireAdminToken(): string {
  const token = adminToken();
  if (!token) {
    throw new SidecarError(503, 'sidecar_admin_token_missing', 'The OpenConnector sidecar admin token is not configured.');
  }
  return token;
}

export async function upsertSidecarConnection(input: {
  service: string;
  connectionName: string;
  authType: 'no_auth' | 'api_key' | 'custom_credential';
  values?: Record<string, unknown>;
}): Promise<unknown> {
  return sidecarFetch(`/api/connections/${encodeURIComponent(input.service)}`, {
    method: 'PUT',
    token: requireAdminToken(),
    body: { authType: input.authType, values: input.values || {}, connectionName: input.connectionName },
  });
}

export async function deleteSidecarConnection(input: { service: string; connectionName: string }): Promise<unknown> {
  return sidecarFetch(`/api/connections/${encodeURIComponent(input.service)}?connectionName=${encodeURIComponent(input.connectionName)}`, {
    method: 'DELETE',
    token: requireAdminToken(),
  });
}

export interface SidecarOAuthConfigSummary {
  service: string;
  configured: boolean;
  clientId: string | null;
  expectedRedirectUri: string;
  auth?: {
    tokenEndpointAuthMethod?: string;
    clientConfigFields?: SidecarAuthField[] & { location?: string }[];
  } | null;
}

export async function listSidecarOAuthConfigs(): Promise<SidecarOAuthConfigSummary[]> {
  const data = await sidecarFetch('/api/oauth/configs', { token: requireAdminToken() });
  const envelope = (data || {}) as { data?: unknown };
  const list = (Array.isArray(data) ? data : envelope.data) as SidecarOAuthConfigSummary[] | undefined;
  return Array.isArray(list) ? list : [];
}

export async function getSidecarOAuthConfig(service: string): Promise<SidecarOAuthConfigSummary | null> {
  const list = await listSidecarOAuthConfigs();
  return list.find((item) => item && item.service === service) || null;
}

export async function upsertSidecarOAuthConfig(input: {
  service: string;
  clientId: string;
  clientSecret: string;
  extra?: Record<string, unknown>;
  secretExtra?: Record<string, unknown>;
}): Promise<SidecarOAuthConfigSummary> {
  const data = await sidecarFetch(`/api/oauth/configs/${encodeURIComponent(input.service)}`, {
    method: 'PUT',
    token: requireAdminToken(),
    body: {
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      extra: input.extra || {},
      secretExtra: input.secretExtra || {},
    },
  });
  const envelope = (data || {}) as { data?: SidecarOAuthConfigSummary };
  const summary = ((envelope.data && typeof envelope.data === 'object' ? envelope.data : data) || {}) as SidecarOAuthConfigSummary;
  return summary;
}

export async function startSidecarOAuth(input: {
  service: string;
  connectionName: string;
}): Promise<{ authorizationUrl: string; state?: string }> {
  const data = await sidecarFetch('/api/oauth/authorizations', {
    method: 'POST',
    token: requireAdminToken(),
    body: { service: input.service, connectionName: input.connectionName },
  }) as { authorizationUrl?: string; state?: string };
  if (!data || !data.authorizationUrl) {
    throw new SidecarError(502, 'sidecar_bad_response', 'The sidecar did not return an authorization URL.');
  }
  return { authorizationUrl: data.authorizationUrl, state: data.state };
}

interface RuntimeConnectedApp {
  service: string;
  status: 'active' | 'disconnected';
  alias?: string | null;
  displayName?: string | null;
}

export async function getSidecarConnectionStatus(input: {
  service: string;
  connectionName: string;
}): Promise<SidecarConnectionStatus> {
  const data = await sidecarFetch(
    `/v1/apps/services/${encodeURIComponent(input.service)}?connectionName=${encodeURIComponent(input.connectionName)}`,
    { token: runtimeToken() || adminToken() },
  );
  const envelope = (data || {}) as { success?: boolean; data?: unknown };
  const apps = (Array.isArray(data) ? data : envelope.data) as RuntimeConnectedApp[] | undefined;
  const match = Array.isArray(apps) ? apps.find((app) => app && (app.alias === input.connectionName || !app.alias)) : undefined;
  if (!match) return { connected: false, connectionName: null, displayName: null };
  return { connected: match.status === 'active', connectionName: match.alias || null, displayName: match.displayName || null };
}

export async function executeSidecarAction(input: {
  actionId: string;
  input: Record<string, unknown>;
  connectionName: string;
}): Promise<unknown> {
  const token = runtimeToken() || adminToken();
  if (!token) {
    throw new SidecarError(503, 'sidecar_token_missing', 'The OpenConnector sidecar token is not configured.');
  }
  return sidecarFetch(`/v1/actions/${encodeURIComponent(input.actionId)}`, {
    method: 'POST',
    token,
    body: { input: input.input, connectionName: input.connectionName },
    timeoutMs: 60_000,
  });
}

export function clearSidecarProviderCache(): void {
  providerCache = null;
}
