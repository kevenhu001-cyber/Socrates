import { apiFetch } from '../../util/api.js';
import { setBuiltInProviderModel } from '../../config/providerConfig.service.ts';
import { showToast } from '../../ui/toast.js';
import { loadSharedSession } from '../../ui/share.js';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { showAuthView, submitAuthVerify, revealAppAndHydrate } from '../index.js';
import { selectAuthUrlRoute } from './routeSelector.js';

/** Handle URL-only auth routes before starting the normal /me/config probes. */
export async function handleAuthUrlRoutes(params, csrfReady) {
  const route = selectAuthUrlRoute(params, location.hostname);
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
async function handleLocalDevRoute(params, csrfReady) {
  await csrfReady;
  const next = params.get('next');
  const search = next ? '?next=' + encodeURIComponent(next) : '';
  history.replaceState(null, '', location.pathname + search);
  try {
    setBuiltInProviderModel('local');
    window.SERVER_HAS_BEAGLE_KEY = true;
  } catch (error) { reportSwallow(error, 'auth/boot.localDev.config'); }
  const user = { id: 'local-dev', name: 'Local Dev', email: 'dev@local', plan: 'local', isLocal: true };
  if (typeof window.setCurrentUser === 'function') window.setCurrentUser(user);
  else window.CURRENT_USER = user;
  try {
    if (window.markAuthSuccess) window.markAuthSuccess();
  } catch (error) { reportSwallow(error, 'auth/boot.localDev.markAuthSuccess'); }
  revealAppAndHydrate();
  return true;
}

function handleOAuthErrorRoute(params) {
  const oauthError = params.get('oauth_error');
  history.replaceState(null, '', location.pathname);
  showSigninGate();
  const message = 'GitHub login failed: ' + decodeURIComponent(oauthError) + '.';
  setTimeout(() => {
    try { showToast(message, 5000); }
    catch (error) { reportSwallow(error, 'auth/boot.oauthError.toast'); }
  }, 500);
  return true;
}

function handlePlainErrorRoute() {
  history.replaceState(null, '', location.pathname);
  showSigninGate();
}

async function handleSharedSessionRoute(params) {
  const shareToken = params.get('share');
  history.replaceState(null, '', location.pathname);
  try { await loadSharedSession(shareToken); }
  catch (error) { reportSwallow(error, 'auth/boot.shareSession'); }
  return true;
}

async function handleVerificationRoute(params, csrfReady) {
  const token = params.get('token');
  await csrfReady;
  const redirect = params.get('redirect');
  history.replaceState(null, '', location.pathname + (redirect ? '?redirect=' + encodeURIComponent(redirect) : ''));
  showGate();
  if (typeof submitAuthVerify === 'function') await submitAuthVerify(token);
  return true;
}

function handlePasswordResetRoute(params) {
  const token = params.get('reset_token');
  history.replaceState(null, '', location.pathname);
  showGate();
  window.__resetToken = token;
  if (typeof showAuthView === 'function') showAuthView('authResetPasswordView');
  clearAuthTabSelection();
  void prefillResetEmail(token);
  return true;
}

async function prefillResetEmail(token) {
  try {
    const info = await apiFetch('/api/auth/reset-info?token=' + encodeURIComponent(token));
    const emailInput = document.getElementById('authResetEmail');
    if (emailInput && info && info.email) emailInput.value = info.email;
  } catch (error) { reportSwallow(error, 'auth/boot.passwordReset.prefillEmail'); }
}

function showSigninGate() {
  showGate();
  if (typeof window.showAuthSignin === 'function') window.showAuthSignin();
}

function showGate() {
  if (typeof window.showGate === 'function') window.showGate();
}

function clearAuthTabSelection() {
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.classList.remove('active');
    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('tabindex', '-1');
  });
}
