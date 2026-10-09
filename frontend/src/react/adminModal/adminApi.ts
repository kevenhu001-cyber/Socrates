import type { EmbeddingProviderConfig, SystemModelConfig } from './types';

const ADMIN_AUTH_API = '/api/admin-auth';
const ADMIN_API = '/api/system-models';
const EMBEDDING_API = '/api/embedding-config';
const TOKEN_KEY = 'socrates_admin_token';

export interface AdminAuthStatus {
  configured: boolean;
  ipAllowed?: boolean;
}

export class AdminUnauthorizedError extends Error {
  constructor() {
    super('Admin session expired. Sign in again.');
    this.name = 'AdminUnauthorizedError';
  }
}

function storedToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function hasAdminToken(): boolean {
  return Boolean(storedToken());
}

function storeToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }
}

export function clearAdminToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }
}

function authHeaders(enabled = true): Record<string, string> {
  if (!enabled) return {};
  const token = storedToken();
  return token ? { 'X-Admin-Token': token } : {};
}

function csrfHeaders(): Record<string, string> {
  try {
    const match = document.cookie.match(/\bcsrf=([^;]+)/);
    return match ? { 'X-CSRF-Token': match[1] } : {};
  } catch {
    return {};
  }
}

async function responsePayload<T>(response: Response, fallback: T): Promise<T> {
  return response.json().catch(() => fallback);
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const detail = await responsePayload<{ message?: string }>(response, { message: fallback });
  return new Error(detail.message || fallback);
}

export async function getAdminAuthStatus(): Promise<AdminAuthStatus> {
  const response = await fetch(`${ADMIN_AUTH_API}/status`, { credentials: 'same-origin' });
  return responsePayload(response, { configured: false });
}

export async function verifyAdminSession(): Promise<boolean> {
  const response = await fetch(`${ADMIN_AUTH_API}/verify`, {
    headers: authHeaders(),
    credentials: 'same-origin',
  });
  const payload = await responsePayload<{ valid?: boolean }>(response, { valid: false });
  return !!payload.valid;
}

export async function loginAdmin(password: string): Promise<void> {
  const response = await fetch(`${ADMIN_AUTH_API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
    credentials: 'same-origin',
    body: JSON.stringify({ password }),
  });
  const payload = await responsePayload<{ error?: string; message?: string; token?: string }>(response, {});
  if (!response.ok) {
    if (response.status === 403 && payload.error === 'admin_ip_not_allowed') {
      throw new Error('This client IP is not on the admin allowlist (ADMIN_IP_ALLOWLIST). Contact the operator to add it.');
    }
    if (response.status === 429) {
      throw new Error('Too many failed attempts — the console is locked for 15 minutes.');
    }
    throw new Error(payload.message || 'Incorrect admin password.');
  }
  storeToken(payload.token || '');
}

export async function loadAdminConfiguration(): Promise<{
  systemModel: SystemModelConfig | null;
  embedding: EmbeddingProviderConfig | null;
}> {
  const [systemResponse, embeddingResponse] = await Promise.all([
    fetch(ADMIN_API, { headers: authHeaders(), credentials: 'same-origin' }),
    fetch(EMBEDDING_API, { headers: authHeaders(), credentials: 'same-origin' }),
  ]);
  if (systemResponse.status === 403 || embeddingResponse.status === 403) {
    throw new AdminUnauthorizedError();
  }
  const systemModel = systemResponse.ok
    ? await responsePayload<SystemModelConfig | null>(systemResponse, null)
    : null;
  const embeddingPayload = embeddingResponse.ok
    ? await responsePayload<EmbeddingProviderConfig | EmbeddingProviderConfig[] | null>(embeddingResponse, null)
    : null;
  const embedding = Array.isArray(embeddingPayload) ? embeddingPayload[0] ?? null : embeddingPayload;
  return { systemModel, embedding };
}

export async function saveSystemModel(
  form: SystemModelConfig,
  key: string,
  options: { includeToken?: boolean; includeKeyHint?: boolean } = {},
): Promise<SystemModelConfig> {
  const body: Record<string, unknown> = {
    label: form.label,
    url: form.url,
    model: form.model,
    isMultimodal: form.isMultimodal,
  };
  if (key) body.key = key;
  if (options.includeKeyHint && form.keyHint) body.keyHint = form.keyHint;
  const response = await fetch(ADMIN_API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(options.includeToken), ...csrfHeaders() },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await responseError(response, 'Save failed');
  return response.json();
}

export async function saveEmbeddingProvider(
  form: EmbeddingProviderConfig,
  key: string,
  options: { includeToken?: boolean; includeKeyHint?: boolean } = {},
): Promise<EmbeddingProviderConfig> {
  const body: Record<string, unknown> = {
    label: form.label,
    url: form.url,
    model: form.model,
    dimensions: form.dimensions,
  };
  if (key) body.key = key;
  if (options.includeKeyHint && form.keyHint) body.keyHint = form.keyHint;
  const response = await fetch(EMBEDDING_API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(options.includeToken), ...csrfHeaders() },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await responseError(response, 'Save failed');
  return response.json();
}

export async function removeEmbeddingProvider(id: string, includeToken = true): Promise<void> {
  const response = await fetch(`${EMBEDDING_API}/${id}`, {
    method: 'DELETE',
    headers: { ...authHeaders(includeToken), ...csrfHeaders() },
    credentials: 'same-origin',
  });
  if (!response.ok) throw await responseError(response, 'Delete failed');
}

export async function logoutAdmin(): Promise<void> {
  try {
    await fetch(`${ADMIN_AUTH_API}/logout`, {
      method: 'POST',
      headers: csrfHeaders(),
      credentials: 'same-origin',
    });
  } catch {
    // Clear the local session even if the server cannot be reached.
  }
  clearAdminToken();
}
