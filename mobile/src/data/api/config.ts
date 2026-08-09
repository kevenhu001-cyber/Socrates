const DEFAULT_API_BASE_URL = 'https://app.topodrive.top/api';

export function resolveApiBaseUrl(value?: string) {
  const configured = value?.trim() || DEFAULT_API_BASE_URL;
  return configured.replace(/\/+$/, '');
}

export function webBaseUrlForApi(apiBaseUrl: string) {
  return apiBaseUrl.replace(/\/api(?:\/v2)?$/, '');
}

export function authBaseUrlForApi(apiBaseUrl: string) {
  return `${webBaseUrlForApi(apiBaseUrl)}/api`;
}

export const API_BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
export const WEB_BASE_URL = webBaseUrlForApi(API_BASE_URL);
export const AUTH_BASE_URL = authBaseUrlForApi(API_BASE_URL);
