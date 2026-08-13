import { shouldRefreshAfterUnauthorized } from './retryPolicy';

describe('mobile unauthorized retry policy', () => {
  it('rotates the bearer before retrying the protected WebView hand-off', () => {
    expect(shouldRefreshAfterUnauthorized('/auth/mobile/web-session')).toBe(true);
    expect(shouldRefreshAfterUnauthorized('/auth/mobile/web-session?target=projects')).toBe(true);
  });

  it('does not replay token-issuing endpoints after an authentication failure', () => {
    expect(shouldRefreshAfterUnauthorized('/auth/mobile/login')).toBe(false);
    expect(shouldRefreshAfterUnauthorized('/auth/mobile/login-with-code')).toBe(false);
    expect(shouldRefreshAfterUnauthorized('/auth/mobile/refresh')).toBe(false);
    expect(shouldRefreshAfterUnauthorized('/auth/mobile/oauth/exchange')).toBe(false);
  });

  it('keeps normal authenticated API calls refreshable', () => {
    expect(shouldRefreshAfterUnauthorized('/sessions')).toBe(true);
  });
});
