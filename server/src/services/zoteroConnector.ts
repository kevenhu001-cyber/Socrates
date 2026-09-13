import { decrypt, deriveEncryptionKey, encrypt, sessionSecret } from '../lib/crypto.js';

const ZOTERO_API = 'https://api.zotero.org';
const ZOTERO_API_VERSION = '3';

function encryptionKey() { return deriveEncryptionKey(sessionSecret()); }

export class ZoteroConnectorError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function validApiKey(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

async function zoteroJson(path: string, apiKey: string): Promise<unknown> {
  let response;
  try {
    response = await fetch(`${ZOTERO_API}${path}`, {
      headers: {
        Accept: 'application/json',
        'Zotero-API-Key': apiKey,
        'Zotero-API-Version': ZOTERO_API_VERSION,
      },
    });
  } catch (_) {
    throw new ZoteroConnectorError('ZOTERO_UNAVAILABLE', 'Zotero could not be reached. Try again shortly.');
  }
  let body: unknown = null;
  try { body = await response.json(); } catch (_) { /* error is normalized below */ }
  if (response.status === 401 || response.status === 403) {
    throw new ZoteroConnectorError('ZOTERO_KEY_REJECTED', 'Zotero rejected this API Key or its library permission.');
  }
  if (!response.ok || body === null) {
    throw new ZoteroConnectorError('ZOTERO_REQUEST_FAILED', 'Zotero could not complete the request. Try again shortly.');
  }
  return body;
}

/** Verify a user-created, read-only key and prepare encrypted storage fields. */
export async function createZoteroConnection(apiKey: string) {
  if (!validApiKey(apiKey)) {
    throw new ZoteroConnectorError('ZOTERO_INVALID_KEY', 'Enter a valid Zotero API Key.');
  }
  const keyInfo = await zoteroJson('/keys/current', apiKey) as {
    userID?: string | number;
    username?: string;
    access?: { user?: { library?: boolean; write?: boolean } };
  };
  const userId = String(keyInfo.userID || '');
  const userAccess = keyInfo.access?.user || ({} as { library?: boolean; write?: boolean });
  if (!/^\d{1,20}$/.test(userId) || userAccess.library !== true) {
    throw new ZoteroConnectorError('ZOTERO_LIBRARY_ACCESS_REQUIRED', 'This API Key needs read access to your personal Zotero library.');
  }
  if (userAccess.write === true) {
    throw new ZoteroConnectorError('ZOTERO_READ_ONLY_KEY_REQUIRED', 'For safety, create a separate read-only Zotero API Key for Socrates.');
  }
  return {
    externalAccountId: userId,
    displayName: String(keyInfo.username || 'Zotero library').slice(0, 200),
    avatarUrl: null,
    accessTokenCiphertext: encrypt(apiKey, encryptionKey()),
    refreshTokenCiphertext: null,
    tokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    scopes: 'user_library:read',
    installationIds: [],
  };
}

function creatorName(creator: unknown) {
  if (!creator || typeof creator !== 'object') return '';
  const c = creator as { name?: string; firstName?: string; lastName?: string };
  return c.name || [c.firstName, c.lastName].filter(Boolean).join(' ');
}

interface ZoteroItem {
  key?: string;
  data?: {
    key?: string;
    title?: string;
    itemType?: string;
    date?: string;
    creators?: unknown[];
  };
}

/** Return a small, read-only window into the connected user's bibliography. */
export async function listZoteroItems(connection: { externalAccountId?: string | null; accessTokenCiphertext: string }, query = '') {
  const userId = String(connection.externalAccountId || '');
  if (!/^\d{1,20}$/.test(userId)) throw new ZoteroConnectorError('ZOTERO_RECONNECT_REQUIRED', 'Reconnect Zotero to continue.');
  const params = new URLSearchParams({ format: 'json', limit: '100', sort: 'dateModified', direction: 'desc' });
  if (query) {
    params.set('q', query.slice(0, 200));
    params.set('qmode', 'titleCreatorYear');
  }
  const apiKey = decrypt(connection.accessTokenCiphertext, encryptionKey());
  const items = await zoteroJson(`/users/${encodeURIComponent(userId)}/items/top?${params.toString()}`, apiKey);
  return (Array.isArray(items) ? items : []).map((item: ZoteroItem) => {
    const data = item?.data || {};
    const key = String(item?.key || data.key || '');
    return {
      id: key,
      title: String(data.title || 'Untitled item').slice(0, 500),
      itemType: String(data.itemType || 'item').slice(0, 100),
      date: data.date ? String(data.date).slice(0, 100) : null,
      creators: (Array.isArray(data.creators) ? data.creators : []).map(creatorName).filter(Boolean).slice(0, 8),
      url: key ? `https://www.zotero.org/users/${userId}/items/${encodeURIComponent(key)}` : null,
    };
  });
}
