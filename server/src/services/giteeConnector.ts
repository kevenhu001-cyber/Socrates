import { decrypt, deriveEncryptionKey, encrypt } from '../lib/crypto.js';

const GITEE = 'https://gitee.com';
const GITEE_SCOPES = 'user_info projects issues pull_requests';

interface GiteeTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
}
interface GiteeProfile {
  id?: number | string;
  name?: string;
  login?: string;
  avatar_url?: string;
}
interface GiteeRepo {
  id: number | string;
  full_name?: string;
  private?: boolean;
  html_url?: string;
  updated_at?: string;
}
interface GiteeConnection {
  accessTokenCiphertext: string;
  refreshTokenCiphertext?: string | null;
}

function encryptionKey() { return deriveEncryptionKey(process.env.SESSION_SECRET || 'local-development-only'); }

export function giteeIsConfigured() {
  return Boolean(process.env.CONNECTOR_GITEE_CLIENT_ID && process.env.CONNECTOR_GITEE_CLIENT_SECRET);
}

export function giteeCallbackUrl() {
  return process.env.CONNECTOR_GITEE_CALLBACK_URL || `${process.env.APP_URL || 'https://app.topodrive.top'}/api/connectors/gitee/callback`;
}

export function giteeAuthorizationUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.CONNECTOR_GITEE_CLIENT_ID || '', redirect_uri: giteeCallbackUrl(),
    response_type: 'code', scope: GITEE_SCOPES, state,
  });
  return `${GITEE}/oauth/authorize?${params.toString()}`;
}

async function giteeJson<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  let body: Record<string, unknown> | null = null;
  try { body = await response.json() as Record<string, unknown>; } catch (_) { /* handled below */ }
  if (!response.ok || !body || body.error || body.message === '401 Unauthorized') {
    throw new Error(`Gitee request failed (${response.status || 0})`);
  }
  return body as unknown as T;
}

function tokenFields(token: GiteeTokenResponse) {
  if (!token.access_token) throw new Error('Gitee did not return an access token');
  return {
    accessTokenCiphertext: encrypt(token.access_token, encryptionKey()),
    refreshTokenCiphertext: token.refresh_token ? encrypt(token.refresh_token, encryptionKey()) : null,
    tokenExpiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null,
    refreshTokenExpiresAt: token.refresh_token_expires_in ? new Date(Date.now() + Number(token.refresh_token_expires_in) * 1000) : null,
    scopes: typeof token.scope === 'string' ? token.scope.slice(0, 1000) : GITEE_SCOPES,
  };
}

function tokenRequest(payload: Record<string, string | undefined>) {
  return giteeJson<GiteeTokenResponse>(`${GITEE}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(payload as Record<string, string>),
  });
}

export async function completeGiteeAuthorization(code: string) {
  if (!giteeIsConfigured()) throw new Error('Gitee connector is not configured');
  const token = await tokenRequest({
    grant_type: 'authorization_code', code, client_id: process.env.CONNECTOR_GITEE_CLIENT_ID,
    client_secret: process.env.CONNECTOR_GITEE_CLIENT_SECRET, redirect_uri: giteeCallbackUrl(),
  });
  const profile = await giteeJson<GiteeProfile>(`${GITEE}/api/v5/user?${new URLSearchParams({ access_token: token.access_token } as Record<string, string>)}`);
  return {
    ...tokenFields(token), externalAccountId: profile.id ? String(profile.id) : null,
    displayName: String(profile.name || profile.login || 'Gitee user').slice(0, 200),
    avatarUrl: profile.avatar_url ? String(profile.avatar_url).slice(0, 2000) : null,
    installationIds: [],
  };
}

export async function refreshGiteeAuthorization(connection: GiteeConnection) {
  if (!giteeIsConfigured() || !connection.refreshTokenCiphertext) throw new Error('Gitee reauthorization is required');
  const token = await tokenRequest({
    grant_type: 'refresh_token', refresh_token: decrypt(connection.refreshTokenCiphertext, encryptionKey()),
    client_id: process.env.CONNECTOR_GITEE_CLIENT_ID, client_secret: process.env.CONNECTOR_GITEE_CLIENT_SECRET,
  });
  return tokenFields(token);
}

export async function listGiteeRepositories(connection: GiteeConnection) {
  const accessToken = decrypt(connection.accessTokenCiphertext, encryptionKey());
  const query = new URLSearchParams({ access_token: accessToken, page: '1', per_page: '100', sort: 'updated', direction: 'desc' });
  const repositories = await giteeJson<GiteeRepo[]>(`${GITEE}/api/v5/user/repos?${query}`);
  return (Array.isArray(repositories) ? repositories : []).map((repo) => ({
    id: String(repo.id), fullName: repo.full_name, private: Boolean(repo.private), htmlUrl: repo.html_url, updatedAt: repo.updated_at,
  }));
}
