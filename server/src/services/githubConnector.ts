import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { deriveEncryptionKey, encrypt } from '../lib/crypto.js';

const GITHUB_API = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const STATE_TTL_MS = 10 * 60 * 1000;

interface GithubTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
}
interface GithubProfile {
  id?: number | string;
  name?: string;
  login?: string;
  avatar_url?: string;
}
interface GithubInstallations {
  installations?: Array<{ id: number | string }>;
}
interface GithubInstallationToken {
  token?: string;
}
interface GithubRepo {
  id: number | string;
  full_name?: string;
  private?: boolean;
  html_url?: string;
  updated_at?: string;
}
interface GithubRepositories {
  repositories?: GithubRepo[];
}
interface GithubConnection {
  installationIds?: number[];
}

function base64Url(value: string) { return Buffer.from(value).toString('base64url'); }
function stateSecret() { return process.env.CONNECTOR_STATE_SECRET || process.env.SESSION_SECRET || 'local-development-only'; }
function encryptionKey() { return deriveEncryptionKey(process.env.SESSION_SECRET || 'local-development-only'); }
function timingSafeMatch(left: unknown, right: unknown) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function githubIsConfigured() {
  return Boolean(process.env.CONNECTOR_GITHUB_CLIENT_ID && process.env.CONNECTOR_GITHUB_CLIENT_SECRET);
}

export function githubCallbackUrl() {
  return process.env.CONNECTOR_GITHUB_CALLBACK_URL || `${process.env.APP_URL || 'https://app.topodrive.top'}/api/connectors/github/callback`;
}

export function createOAuthState(userId: string) {
  const payload = base64Url(JSON.stringify({ userId, exp: Date.now() + STATE_TTL_MS, nonce: crypto.randomBytes(18).toString('base64url') }));
  const signature = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state: unknown) {
  if (typeof state !== 'string' || state.length > 2048) return null;
  const [payload, signature, extra] = state.split('.');
  if (!payload || !signature || extra) return null;
  const expected = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  if (!timingSafeMatch(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.userId !== 'string' || !Number.isFinite(parsed.exp) || parsed.exp < Date.now()) return null;
    return parsed;
  } catch (_) { return null; }
}

function githubHeaders(token: string) {
  return {
    Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': GITHUB_API_VERSION, 'User-Agent': 'Socrates-Connector',
  };
}

async function githubJson<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function completeGithubAuthorization(code: string) {
  if (!githubIsConfigured()) throw new Error('GitHub connector is not configured');
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Socrates-Connector' },
    body: JSON.stringify({
      client_id: process.env.CONNECTOR_GITHUB_CLIENT_ID,
      client_secret: process.env.CONNECTOR_GITHUB_CLIENT_SECRET,
      code, redirect_uri: githubCallbackUrl(),
    }),
  });
  if (!tokenResponse.ok) throw new Error(`GitHub authorization failed (${tokenResponse.status})`);
  const token = await tokenResponse.json() as GithubTokenResponse;
  if (!token.access_token) throw new Error('GitHub did not return an access token');
  const [profile, installations] = await Promise.all([
    githubJson<GithubProfile>(`${GITHUB_API}/user`, { headers: githubHeaders(token.access_token) }),
    githubJson<GithubInstallations>(`${GITHUB_API}/user/installations`, { headers: githubHeaders(token.access_token) }),
  ]);
  return {
    accessTokenCiphertext: encrypt(token.access_token, encryptionKey()),
    refreshTokenCiphertext: token.refresh_token ? encrypt(token.refresh_token, encryptionKey()) : null,
    tokenExpiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null,
    refreshTokenExpiresAt: token.refresh_token_expires_in ? new Date(Date.now() + Number(token.refresh_token_expires_in) * 1000) : null,
    scopes: typeof token.scope === 'string' ? token.scope.slice(0, 1000) : null,
    externalAccountId: profile.id ? String(profile.id) : null,
    displayName: String(profile.name || profile.login || 'GitHub user').slice(0, 200),
    avatarUrl: profile.avatar_url ? String(profile.avatar_url).slice(0, 2000) : null,
    installationIds: Array.isArray(installations.installations)
      ? installations.installations.map((item) => Number(item.id)).filter(Number.isSafeInteger) : [],
  };
}

export function verifyGithubWebhook(rawBody: unknown, signature: unknown) {
  const secret = process.env.CONNECTOR_GITHUB_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(rawBody) || typeof signature !== 'string') return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return timingSafeMatch(signature, expected);
}

export async function createGithubAppJwt() {
  const appId = process.env.CONNECTOR_GITHUB_APP_ID;
  const keyPath = process.env.CONNECTOR_GITHUB_PRIVATE_KEY_PATH;
  if (!appId || !keyPath) throw new Error('GitHub App credentials are not configured');
  const pem = await fs.readFile(path.resolve(process.cwd(), keyPath), 'utf8');
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }));
  const signingInput = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput); signer.end();
  return `${signingInput}.${signer.sign(pem).toString('base64url')}`;
}

export async function listGithubInstallationRepositories(connection: GithubConnection) {
  const ids = Array.isArray(connection.installationIds) ? connection.installationIds : [];
  const installationId = ids.find((value: number) => Number.isSafeInteger(Number(value)));
  if (!installationId) return [];
  const jwt = await createGithubAppJwt();
  const installationToken = await githubJson<GithubInstallationToken>(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST', headers: githubHeaders(jwt),
  });
  if (!installationToken.token) throw new Error('GitHub did not return an installation token');
  const repositories = await githubJson<GithubRepositories>(`${GITHUB_API}/installation/repositories?per_page=100`, {
    headers: githubHeaders(installationToken.token),
  });
  return (repositories.repositories || []).map((repo) => ({
    id: String(repo.id), fullName: repo.full_name, private: Boolean(repo.private), htmlUrl: repo.html_url, updatedAt: repo.updated_at,
  }));
}
