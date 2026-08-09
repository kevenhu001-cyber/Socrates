export type WebThemeMode = 'dark' | 'light';

export interface NativeWebMessage {
  type: 'theme';
  mode: WebThemeMode;
}

export interface MobileBootstrap {
  ok: true;
  contractVersion: 1;
  webBaseUrl: string;
  apiBaseUrl: string;
  canonicalApiBaseUrl: string;
  healthPath: '/api/v2/health';
}

const EXTERNAL_SCHEMES = /^(mailto:|tel:|sms:|geo:)/i;

export function isExternalScheme(url: string) {
  return EXTERNAL_SCHEMES.test(url);
}

export function parseNativeWebMessage(raw: string): NativeWebMessage | null {
  try {
    const value = JSON.parse(raw) as Partial<NativeWebMessage>;
    if (value.type === 'theme' && (value.mode === 'dark' || value.mode === 'light')) {
      return { type: 'theme', mode: value.mode };
    }
  } catch {
    // Ignore messages from ordinary page scripts.
  }
  return null;
}

export function normalizeWebBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function normalizeApiBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

/** Accept only the same API origin and version prefix compiled into the app. */
export function parseMobileBootstrap(value: unknown, configuredApiBaseUrl: string): MobileBootstrap | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<MobileBootstrap>;
  if (candidate.ok !== true || candidate.contractVersion !== 1) return null;
  if (
    typeof candidate.webBaseUrl !== 'string'
    || typeof candidate.apiBaseUrl !== 'string'
    || typeof candidate.canonicalApiBaseUrl !== 'string'
    || candidate.healthPath !== '/api/v2/health'
  ) return null;

  try {
    const webBaseUrl = normalizeWebBaseUrl(candidate.webBaseUrl);
    const apiBaseUrl = normalizeApiBaseUrl(candidate.apiBaseUrl);
    const canonicalApiBaseUrl = normalizeApiBaseUrl(candidate.canonicalApiBaseUrl);
    const expectedApiBaseUrl = normalizeApiBaseUrl(configuredApiBaseUrl);
    const web = new URL(webBaseUrl);
    const api = new URL(apiBaseUrl);
    const canonical = new URL(canonicalApiBaseUrl);

    if (!['https:', 'http:'].includes(web.protocol)) return null;
    if (web.origin !== api.origin || web.origin !== canonical.origin) return null;
    if (apiBaseUrl !== expectedApiBaseUrl) return null;
    if (api.pathname.replace(/\/+$/, '') !== '/api/v2') return null;
    if (canonical.pathname.replace(/\/+$/, '') !== '/api') return null;

    return {
      ok: true,
      contractVersion: 1,
      webBaseUrl,
      apiBaseUrl,
      canonicalApiBaseUrl,
      healthPath: '/api/v2/health',
    };
  } catch {
    return null;
  }
}
