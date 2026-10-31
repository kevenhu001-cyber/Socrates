import { apiFetch } from '../../util/api.ts';
import { setBuiltInProviderModel, setServerBuiltInKeyAvailable } from '../../config/providerConfig.service.ts';
import { showToast } from '../../ui/toast.js';
import { loadSharedSession } from '../../ui/share.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { clearAuthTabSelection, showAuthView, showAuthSignin, showGate, submitAuthVerify, revealAppAndHydrate } from '../index.ts';
import { selectAuthUrlRoute } from './routeSelector.ts';
import { recordBootedRouteKind } from './routeState.ts';
import { setAuthField } from '../uiState.ts';

/** Auth-view hooks still published on the window by the legacy shell. */
interface BootRoutesWindow extends Window {
  setCurrentUser?: (user: unknown) => void;
  markAuthSuccess?: () => void;
  __resetToken?: string | null;
}

/** Handle URL-only auth routes before starting the normal /me/config probes. */
export async function handleAuthUrlRoutes(
  params: URLSearchParams,
  csrfReady: PromiseLike<unknown>,
): Promise<boolean> {
  const route = selectAuthUrlRoute(params, location.hostname);
  /* Record before any handler can rewrite location and erase the query. */
  recordBootedRouteKind(route.kind);
  if (route.kind !== 'local-dev' && route.kind !== 'oauth-error' && route.plainError) {
    handlePlainErrorRoute();
  }

  switch (route.kind) {
    case 'local-dev': return handleLocalDevRoute(params, csrfReady);
    case 'oauth-error': return handleOAuthErrorRoute(params);
    case 'share': return handleSharedSessionRoute(params);
    case 'verify': return handleVerificationRoute(params, csrfReady);
    case 'password-reset': return handlePasswordResetRoute(params);
    default: return false;
  }
}

/** Resolve route precedence without touching browser state. */
async function handleLocalDevRoute(params: URLSearchParams, csrfReady: PromiseLike<unknown>): Promise<boolean> {
  await csrfReady;
  const next = params.get('next');
  const search = next ? '?next=' + encodeURIComponent(next) : '';
  history.replaceState(null, '', location.pathname + search);
  try {
    setBuiltInProviderModel('local');
    setServerBuiltInKeyAvailable(true);
  } catch (error) { reportSwallow(error, 'auth/boot.localDev.config'); }
  const user = { id: 'local-dev', name: 'Local Dev', email: 'dev@local', plan: 'local', isLocal: true };
  const win = window as BootRoutesWindow;
  if (typeof win.setCurrentUser === 'function') win.setCurrentUser(user);
  /* The window declaration only pins the fields providerConfig reads (`tier`);
     the local-dev record is a wider shape, so widen before assigning. */
  else window.CURRENT_USER = user as Record<string, unknown>;
  try {
    if (win.markAuthSuccess) win.markAuthSuccess();
  } catch (error) { reportSwallow(error, 'auth/boot.localDev.markAuthSuccess'); }
  revealAppAndHydrate();
  return true;
}

function handleOAuthErrorRoute(params: URLSearchParams): boolean {
  /* The selector only routes here when the parameter is present. */
  const oauthError = params.get('oauth_error') || '';
  history.replaceState(null, '', location.pathname);
  showSigninGate();
  const message = 'GitHub login failed: ' + decodeURIComponent(oauthError) + '.';
  setTimeout(() => {
    try { showToast(message, 5000); }
    catch (error) { reportSwallow(error, 'auth/boot.oauthError.toast'); }
  }, 500);
  return true;
}

function handlePlainErrorRoute(): void {
  history.replaceState(null, '', location.pathname);
  showSigninGate();
}

async function handleSharedSessionRoute(params: URLSearchParams): Promise<boolean> {
  const shareToken = params.get('share') || '';
  history.replaceState(null, '', location.pathname);
  try { await loadSharedSession(shareToken); }
  catch (error) { reportSwallow(error, 'auth/boot.shareSession'); }
  return true;
}

async function handleVerificationRoute(params: URLSearchParams, csrfReady: PromiseLike<unknown>): Promise<boolean> {
  const token = params.get('token') || '';
  await csrfReady;
  const redirect = params.get('redirect');
  history.replaceState(null, '', location.pathname + (redirect ? '?redirect=' + encodeURIComponent(redirect) : ''));
  showGate();
  if (typeof submitAuthVerify === 'function') await submitAuthVerify(token);
  return true;
}

function handlePasswordResetRoute(params: URLSearchParams): boolean {
  const token = params.get('reset_token');
  history.replaceState(null, '', location.pathname);
  showGate();
  (window as BootRoutesWindow).__resetToken = token;
  if (typeof showAuthView === 'function') showAuthView('authResetPasswordView');
  clearAuthTabSelection();
  void prefillResetEmail(token || '');
  return true;
}

async function prefillResetEmail(token: string): Promise<void> {
  try {
    const info = await apiFetch<{ email?: string }>('/api/auth/reset-info?token=' + encodeURIComponent(token));
    if (info && info.email) setAuthField('authResetEmail', info.email);
  } catch (error) { reportSwallow(error, 'auth/boot.passwordReset.prefillEmail'); }
}

function showSigninGate(): void {
  showGate();
  showAuthSignin();
}
