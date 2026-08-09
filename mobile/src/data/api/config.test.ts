import { authBaseUrlForApi, resolveApiBaseUrl, webBaseUrlForApi } from './config';

describe('mobile API configuration', () => {
  it('uses the deployed Socrates API as the production default', () => {
    expect(resolveApiBaseUrl()).toBe('https://app.topodrive.top/api');
  });

  it('normalizes trailing slashes', () => {
    expect(resolveApiBaseUrl('https://example.test/api///')).toBe('https://example.test/api');
  });

  it('always sends browser OAuth through the canonical /api routes', () => {
    expect(webBaseUrlForApi('https://app.topodrive.top/api')).toBe('https://app.topodrive.top');
    expect(authBaseUrlForApi('https://app.topodrive.top/api/v2')).toBe('https://app.topodrive.top/api');
  });
});
