/** Resolve URL-only auth routes and their precedence without browser effects. */
export function selectAuthUrlRoute(params, hostname) {
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname);
  if (params.get('dev') === '1' && localHost) return { kind: 'local-dev' };
  const oauthError = params.get('oauth_error');
  if (oauthError) return { kind: 'oauth-error', oauthError };

  const plainError = params.get('error');
  const shareToken = params.get('share');
  if (shareToken) return { kind: 'share', shareToken, plainError };
  const token = params.get('token');
  if (token) return { kind: 'verify', token, plainError };
  const resetToken = params.get('reset_token');
  if (resetToken) return { kind: 'password-reset', resetToken, plainError };
  return { kind: 'continue', plainError };
}
