/* ── Authentication gate ──
   React owns auth views, tabs, form values, errors, and interaction handlers.
   This module provides the state bridge and form request actions.

   Extracted from main.js. Reads main.js globals via window (state,
   markAuthSuccess, CURRENT_USER, apiFetch, etc.) so this module
   remains independent.

   The initial /api/auth/me sequence lives in ./boot.js; the auth-expired
   callback stays with the application lifecycle because it coordinates
   session teardown before returning the user to this gate. */

import { notifyEmbeddedAuthExpired } from '../native/mobileWebSessionBridge.ts';
import { offerBrowserLoginHandoff } from '../native/browserLoginHandoff.ts';
import { syncCookieConsentPlacement } from '../cookieConsent.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { afterAuthEnter } from './postAuth.ts';
import { createAuthFormHandlers } from './forms.ts';
import {
  setGateVisible,
  setBootState,
  showView,
  switchTab as shellSwitchTab,
  focusTab,
  clearTabSelection,
  setError as shellSetError,
  getValue,
  setValue,
  setVisible,
  type AuthRoot,
} from './shell.ts';

export { afterAuthEnter };

interface AuthLegacyWindow extends Window {
  ReactNativeWebView?: { postMessage?: (message: string) => void };
  __socratesMountReactCompatibility?: () => void;
}

function isEmbeddedNativeWebView(): boolean {
  try {
    const bridge = (window as AuthLegacyWindow).ReactNativeWebView;
    return !!(bridge && typeof bridge.postMessage === "function");
  } catch { return false; }
}

/* ── Gate display helpers ──
   The outer shell visibility remains a browser boundary. Auth views and
   controls update the React-owned state consumed by AuthGate. */

export function hideGate(root?: AuthRoot): void {
  const r = root || document;
  setGateVisible(r, true);
  /* P0.6 — also flip the pre-boot data attribute so the CSS rules
     in <head> take over. From this point on, showGate()/hideGate()
     are the single source of truth for which view is on top. */
  try { setBootState(r, "app"); } catch (e) { reportSwallow(e, 'auth/index.hideGate.bootState'); }
  syncCookieConsentPlacement(false);
}

export function showGate(root?: AuthRoot): void {
  const r = root || document;
  /* Flip bootState first so the CSS rule hiding #authGate while
     data-boot-state="checking" is removed before we try to show it. */
  try { setBootState(r, "auth"); } catch (e) { reportSwallow(e, 'auth/index.showGate.bootState'); }
  setGateVisible(r, false);
  syncCookieConsentPlacement(true);
  /* A normal browser reaches the auth gate during first paint and during
   * local login flows.  Only tell the native shell that its cookie expired
   * when this is actually a WebView hand-off; otherwise a regular desktop
   * browser does not see an irrelevant bridge message. */
  if (isEmbeddedNativeWebView()) notifyEmbeddedAuthExpired();
}

export function showAuthView(id: string, root?: AuthRoot): void {
  showView(root || document, id);
}

export function showAuthSignin(): void { switchAuthTab("signin"); }
export function showAuthRegister(): void { switchAuthTab("register"); }

export function switchAuthTab(tab: string, root?: AuthRoot): void {
  shellSwitchTab(root || document, tab);
}

/* Roving-tab keyboard behavior for the auth tablist. Kept as a public
 * bridge action so the declarative event map and the runtime window surface
 * share one implementation. */
export function focusAuthTab(el: Element, e: KeyboardEvent, root?: AuthRoot): void {
  if (!e || ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End"].indexOf(e.key) === -1) return;
  if (focusTab(root || document, el, e.key)) e.preventDefault();
}

export function clearAuthTabSelection(root?: AuthRoot): void {
  clearTabSelection(root || document);
}

export function setAuthError(viewId: string, msg: string, root?: AuthRoot): void {
  shellSetError(root || document, viewId, msg);
}

/* ── Forgot password / code-login views ── */

export function showAuthForgotPassword(root?: AuthRoot): void {
  const r = root || document;
  setValue(r, "authForgotEmail", getValue(r, "authSigninEmail"));
  showAuthView("authForgotPasswordView", r);
  clearAuthTabSelection(r);
}

export function showAuthCodeLogin(root?: AuthRoot): void {
  const r = root || document;
  setValue(r, "authCodeEmail", getValue(r, "authSigninEmail"));
  setVisible(r, "authCodeCodeWrap", false);
  setVisible(r, "authCodeSendBtn", true);
  setVisible(r, "authCodeLoginBtn", false);
  setVisible(r, "authCodeResendWrap", false);
  setAuthError("authCodeError", "", r);
  showAuthView("authCodeLoginView", r);
  clearAuthTabSelection(r);
}

/* Reveal the app shell first, then hydrate user data in the background.
   afterAuthEnter's synchronous prefix — clearPerUserClientState and the
   localStorage migration read — still runs before hideGate(), so no
   stale-data frame is painted. Previously every call site awaited the
   full hydration chain (csrf → sessions → api-key → memories → optional
   loadSession) before revealing the shell: 3+ serial round-trips of
   boot-loading spinner on every cold visit. A hydration 401 still routes
   through installAuthHooks → handleAuthExpired → showGate; other failures
   only log — a transient sessions fetch must not bounce an authed user
   back to the gate.
   onHydrated: optional callback fired after hydration settles (success
   or failure) — the mobile hand-off target needs hydrated lists. */
export function revealAppAndHydrate(onHydrated?: () => void): void {
  let hydration: Promise<void>;
  try { hydration = afterAuthEnter(); } catch (err) { hydration = Promise.reject(err); }
  hideGate();
  offerBrowserLoginHandoff();
  /* React's compatibility registry is intentionally deferred until the app
     is visible. This keeps the auth route from downloading the hidden
     composer/editor and modal graph. Share routes do not call this function
     and keep using the lightweight assistant-turn entry point above. */
  try {
    const win = window as AuthLegacyWindow;
    if (typeof win.__socratesMountReactCompatibility === "function") {
      win.__socratesMountReactCompatibility();
    }
  } catch (e) { reportSwallow(e, 'auth/index.mountReactCompatibility'); }
  Promise.resolve(hydration)
    .catch(function (err) { try { console.error("[auth] post-auth hydration failed", err); } catch (e) { reportSwallow(e, 'auth/index.hydrate.log'); } })
    .then(function () { if (typeof onHydrated === "function") try { onHydrated(); } catch (e) { reportSwallow(e, 'auth/index.hydrate.onHydrated'); } });
}

/* Form actions are kept in a feature module so this file remains the gate's
   view and interaction owner. The dependency factory avoids a cycle from
   forms back into this module. */
const authFormHandlers = createAuthFormHandlers({
  showGate,
  showAuthView,
  setAuthError,
  clearAuthTabSelection,
  revealAppAndHydrate,
  translate: (key: string) => window.t(key),
});

export const {
  submitAuthSignin,
  submitAuthRegister,
  resendVerification,
  submitAuthVerify,
  submitAuthForgotPassword,
  submitAuthResetPassword,
  submitAuthSendCode,
  submitAuthLoginWithCode,
  resendAuthCode,
} = authFormHandlers;
