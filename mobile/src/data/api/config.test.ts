import { authBaseUrlForApi, configuredApiBaseUrl, resolveApiBaseUrl, webBaseUrlForApi } from './config';

describe('mobile API configuration', () => {
  it('uses the deployed Socrates API as the production default', () => {
    expect(resolveApiBaseUrl()).toBe('https://app.topodrive.top/api/v2');
  });

  it('normalizes trailing slashes', () => {
    expect(resolveApiBaseUrl('https://example.test/api///')).toBe('https://example.test/api');
  });

  it('always sends browser OAuth through the canonical /api routes', () => {
    expect(webBaseUrlForApi('https://app.topodrive.top/api')).toBe('https://app.topodrive.top');
    expect(authBaseUrlForApi('https://app.topodrive.top/api/v2')).toBe('https://app.topodrive.top/api');
  });

  it('uses Expo config and lets an explicit environment override win', () => {
    expect(configuredApiBaseUrl(undefined, 'https://staging.example.test/api/v2/')).toBe('https://staging.example.test/api/v2');
    expect(configuredApiBaseUrl('http://10.0.2.2:8080/api/v2', 'https://staging.example.test/api/v2')).toBe('http://10.0.2.2:8080/api/v2');
  });
});
