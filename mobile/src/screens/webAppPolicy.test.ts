import { isExternalScheme, normalizeWebBaseUrl, parseMobileBootstrap, parseNativeWebMessage } from './webAppPolicy';

describe('web app shell policy', () => {
  test('recognizes URLs that belong in a native handler', () => {
    expect(isExternalScheme('mailto:hello@example.com')).toBe(true);
    expect(isExternalScheme('tel:+8610010')).toBe(true);
    expect(isExternalScheme('https://app.topodrive.top')).toBe(false);
  });

  test('accepts only the theme bridge message shape', () => {
    expect(parseNativeWebMessage('{"type":"theme","mode":"light"}')).toEqual({ type: 'theme', mode: 'light' });
    expect(parseNativeWebMessage('{"type":"theme","mode":"sepia"}')).toBeNull();
    expect(parseNativeWebMessage('not-json')).toBeNull();
  });

  test('normalizes a configured web origin without changing its path', () => {
    expect(normalizeWebBaseUrl(' https://app.topodrive.top/// ')).toBe('https://app.topodrive.top');
  });

  test('accepts the deployed same-origin mobile API contract', () => {
    expect(parseMobileBootstrap({
      ok: true,
      contractVersion: 1,
      webBaseUrl: 'https://app.topodrive.top/',
      apiBaseUrl: 'https://app.topodrive.top/api/v2',
      canonicalApiBaseUrl: 'https://app.topodrive.top/api',
      healthPath: '/api/v2/health',
    }, 'https://app.topodrive.top/api/v2')).toEqual({
      ok: true,
      contractVersion: 1,
      webBaseUrl: 'https://app.topodrive.top',
      apiBaseUrl: 'https://app.topodrive.top/api/v2',
      canonicalApiBaseUrl: 'https://app.topodrive.top/api',
      healthPath: '/api/v2/health',
    });
  });

  test('rejects a bootstrap that drifts to another host or API prefix', () => {
    expect(parseMobileBootstrap({
      ok: true,
      contractVersion: 1,
      webBaseUrl: 'https://evil.example',
      apiBaseUrl: 'https://evil.example/api/v2',
      canonicalApiBaseUrl: 'https://evil.example/api',
      healthPath: '/api/v2/health',
    }, 'https://app.topodrive.top/api/v2')).toBeNull();
    expect(parseMobileBootstrap({
      ok: true,
      contractVersion: 1,
      webBaseUrl: 'https://app.topodrive.top',
      apiBaseUrl: 'https://app.topodrive.top/api',
      canonicalApiBaseUrl: 'https://app.topodrive.top/api',
      healthPath: '/api/v2/health',
    }, 'https://app.topodrive.top/api/v2')).toBeNull();
  });
});
