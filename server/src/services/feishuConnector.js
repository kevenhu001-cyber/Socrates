import { decrypt, deriveEncryptionKey, encrypt } from '../lib/crypto.js';

const FEISHU_API = 'https://open.feishu.cn/open-apis';
const FEISHU_AUTHORIZE = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
const FEISHU_SCOPES = ['auth:user.id:read', 'offline_access', 'docx:document:readonly', 'drive:drive.metadata:readonly'];

function encryptionKey() { return deriveEncryptionKey(process.env.SESSION_SECRET || 'local-development-only'); }

export function feishuIsConfigured() {
  return Boolean(process.env.CONNECTOR_FEISHU_APP_ID && process.env.CONNECTOR_FEISHU_APP_SECRET);
}

export function feishuCallbackUrl() {
  return process.env.CONNECTOR_FEISHU_CALLBACK_URL || `${process.env.APP_URL || 'https://app.topodrive.top'}/api/connectors/feishu/callback`;
}

export function feishuAuthorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.CONNECTOR_FEISHU_APP_ID || '', redirect_uri: feishuCallbackUrl(),
    state, scope: FEISHU_SCOPES.join(' '),
  });
  return `${FEISHU_AUTHORIZE}?${params.toString()}`;
}

async function feishuJson(url, options) {
  const response = await fetch(url, options);
  let body = null;
  try { body = await response.json(); } catch (_) { /* handled below */ }
  if (!response.ok || !body || body.code !== 0) {
    throw new Error(`Feishu request failed (${response.status || 0})`);
  }
  return body;
}

function tokenFields(token) {
  if (!token.access_token) throw new Error('Feishu did not return an access token');
  return {
    accessTokenCiphertext: encrypt(token.access_token, encryptionKey()),
    refreshTokenCiphertext: token.refresh_token ? encrypt(token.refresh_token, encryptionKey()) : null,
    tokenExpiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null,
    refreshTokenExpiresAt: token.refresh_token_expires_in ? new Date(Date.now() + Number(token.refresh_token_expires_in) * 1000) : null,
    scopes: typeof token.scope === 'string' ? token.scope.slice(0, 1000) : null,
  };
}

export async function completeFeishuAuthorization(code) {
  if (!feishuIsConfigured()) throw new Error('Feishu connector is not configured');
  const token = await feishuJson(`${FEISHU_API}/authen/v2/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      grant_type: 'authorization_code', client_id: process.env.CONNECTOR_FEISHU_APP_ID,
      client_secret: process.env.CONNECTOR_FEISHU_APP_SECRET, code, redirect_uri: feishuCallbackUrl(),
    }),
  });
  const profile = await feishuJson(`${FEISHU_API}/authen/v1/user_info`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const user = profile.data || {};
  return {
    ...tokenFields(token), externalAccountId: user.open_id ? String(user.open_id) : null,
    displayName: String(user.name || user.en_name || 'Feishu user').slice(0, 200),
    avatarUrl: user.avatar_url ? String(user.avatar_url).slice(0, 2000) : null,
    installationIds: [],
  };
}

export async function refreshFeishuAuthorization(connection) {
  if (!feishuIsConfigured() || !connection.refreshTokenCiphertext) throw new Error('Feishu reauthorization is required');
  const refreshToken = decrypt(connection.refreshTokenCiphertext, encryptionKey());
  const token = await feishuJson(`${FEISHU_API}/authen/v2/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      grant_type: 'refresh_token', client_id: process.env.CONNECTOR_FEISHU_APP_ID,
      client_secret: process.env.CONNECTOR_FEISHU_APP_SECRET, refresh_token: refreshToken,
    }),
  });
  return tokenFields(token);
}
