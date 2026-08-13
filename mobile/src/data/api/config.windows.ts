const DEFAULT_API_BASE_URL = 'https://app.topodrive.top/api/v2';

function resolveApiBaseUrl(value?: string) {
  const configured = value?.trim() || DEFAULT_API_BASE_URL;
  return configured.replace(/\/+$/, '');
}

function webBaseUrlForApi(apiBaseUrl: string) {
  return apiBaseUrl.replace(/\/api(?:\/v2)?$/, '');
}

function authBaseUrlForApi(apiBaseUrl: string) {
  return `${webBaseUrlForApi(apiBaseUrl)}/api`;
}

const runtimeConfig = (globalThis as typeof globalThis & { __SOCRATES_CONFIG__?: { apiBaseUrl?: unknown } }).__SOCRATES_CONFIG__;
const envValue = typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_API_BASE_URL : undefined;
const extraValue = typeof runtimeConfig?.apiBaseUrl === 'string' ? runtimeConfig.apiBaseUrl : undefined;

export const API_BASE_URL = resolveApiBaseUrl(envValue || extraValue);
export const WEB_BASE_URL = webBaseUrlForApi(API_BASE_URL);
export const AUTH_BASE_URL = authBaseUrlForApi(API_BASE_URL);
