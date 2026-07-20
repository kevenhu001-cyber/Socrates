import { decrypt, deriveEncryptionKey, encrypt } from '../lib/crypto.js';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2026-03-11';

function encryptionKey() { return deriveEncryptionKey(process.env.SESSION_SECRET || 'local-development-only'); }
function basicAuthorization() {
  return `Basic ${Buffer.from(`${process.env.CONNECTOR_NOTION_CLIENT_ID}:${process.env.CONNECTOR_NOTION_CLIENT_SECRET}`).toString('base64')}`;
}

export function notionIsConfigured() {
  return Boolean(process.env.CONNECTOR_NOTION_CLIENT_ID && process.env.CONNECTOR_NOTION_CLIENT_SECRET);
}

export function notionCallbackUrl() {
  return process.env.CONNECTOR_NOTION_CALLBACK_URL || `${process.env.APP_URL || 'https://app.topodrive.top'}/api/connectors/notion/callback`;
}

export function notionAuthorizationUrl(state) {
  const params = new URLSearchParams({
    owner: 'user', client_id: process.env.CONNECTOR_NOTION_CLIENT_ID || '',
    redirect_uri: notionCallbackUrl(), response_type: 'code', state,
  });
  return `${NOTION_API}/oauth/authorize?${params.toString()}`;
}

async function notionJson(url, options) {
  const response = await fetch(url, options);
  let body = null;
  try { body = await response.json(); } catch (_) { /* handled below */ }
  if (!response.ok || !body || body.error) throw new Error(`Notion request failed (${response.status || 0})`);
  return body;
}

function tokenFields(token) {
  if (!token.access_token) throw new Error('Notion did not return an access token');
  return {
    accessTokenCiphertext: encrypt(token.access_token, encryptionKey()),
    refreshTokenCiphertext: token.refresh_token ? encrypt(token.refresh_token, encryptionKey()) : null,
    tokenExpiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null,
    refreshTokenExpiresAt: token.refresh_token_expires_in ? new Date(Date.now() + Number(token.refresh_token_expires_in) * 1000) : null,
    scopes: 'selected_pages',
  };
}

async function notionToken(payload) {
  if (!notionIsConfigured()) throw new Error('Notion connector is not configured');
  return notionJson(`${NOTION_API}/oauth/token`, {
    method: 'POST',
    headers: { Authorization: basicAuthorization(), 'Content-Type': 'application/json', Accept: 'application/json', 'Notion-Version': NOTION_VERSION },
    body: JSON.stringify(payload),
  });
}

export async function completeNotionAuthorization(code) {
  const token = await notionToken({ grant_type: 'authorization_code', code, redirect_uri: notionCallbackUrl() });
  const owner = token.owner?.user || {};
  return {
    ...tokenFields(token), externalAccountId: token.workspace_id || owner.id || null,
    displayName: String(token.workspace_name || owner.name || 'Notion workspace').slice(0, 200),
    avatarUrl: token.workspace_icon ? String(token.workspace_icon).slice(0, 2000) : (owner.avatar_url ? String(owner.avatar_url).slice(0, 2000) : null),
    installationIds: [],
  };
}

export async function refreshNotionAuthorization(connection) {
  if (!connection.refreshTokenCiphertext) throw new Error('Notion reauthorization is required');
  return tokenFields(await notionToken({ grant_type: 'refresh_token', refresh_token: decrypt(connection.refreshTokenCiphertext, encryptionKey()) }));
}

function pageTitle(result) {
  const titleProperty = Object.values(result.properties || {}).find((property) => property?.type === 'title');
  const title = titleProperty?.title?.map((item) => item.plain_text).join('');
  return title || result.url || 'Untitled page';
}

export async function searchNotionPages(connection, query = '') {
  const accessToken = decrypt(connection.accessTokenCiphertext, encryptionKey());
  const body = await notionJson(`${NOTION_API}/search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Notion-Version': NOTION_VERSION },
    body: JSON.stringify({ query, page_size: 100, filter: { property: 'object', value: 'page' }, sort: { direction: 'descending', timestamp: 'last_edited_time' } }),
  });
  return (body.results || []).map((page) => ({ id: page.id, title: pageTitle(page), url: page.url, updatedAt: page.last_edited_time, icon: page.icon?.emoji || null }));
}
