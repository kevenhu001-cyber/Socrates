/* ── Authentication gate ──
   All UI for the auth gate: hide/show, tab switching, view switching,
   error display, and interaction listeners. Form handlers live in ./forms.js.

   Extracted from main.js. Reads main.js globals via window (state,
   markAuthSuccess, CURRENT_USER, apiFetch, etc.) so this module
   remains independent.

   The initial /api/auth/me sequence lives in ./boot.js; the auth-expired
   callback stays with the application lifecycle because it coordinates
   session teardown before returning the user to this gate. */

import { notifyEmbeddedAuthExpired } from '../native/mobileWebSessionBridge.js';
import { syncCookieConsentPlacement } from '../cookieConsent.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { afterAuthEnter } from './postAuth.js';
import { createAuthFormHandlers } from './forms.js';

export { afterAuthEnter };

function isEmbeddedNativeWebView(){
  try{
    var bridge=window.ReactNativeWebView;
    return !!(bridge&&typeof bridge.postMessage==="function");
  }catch(_){return false}
}

/* ── Gate display helpers ──
   DOM ownership lives in ./shell.ts (root-injectable, unit-testable);
   these exports stay as thin delegates so windowExports.js + e2e keep
   working while the gate markup remains in index.html. */

import { setGateVisible, setBootState, showView, switchTab as shellSwitchTab, focusTab, clearTabSelection, setError as shellSetError, getValue, setValue, setText, setVisible } from './shell.ts';

export function hideGate(root){
  var r = root || document;
  setGateVisible(r, true);
  /* P0.6 — also flip the pre-boot data attribute so the CSS rules
     in <head> take over. From this point on, showGate()/hideGate()
     are the single source of truth for which view is on top. */
  try{setBootState(r, "app")}catch(e){reportSwallow(e, 'auth/index.hideGate.bootState'); }
  syncCookieConsentPlacement(false);
}

export function showGate(root){
  var r = root || document;
  /* Flip bootState first so the CSS rule hiding #authGate while
     data-boot-state="checking" is removed before we try to show it. */
  try{setBootState(r, "auth")}catch(e){reportSwallow(e, 'auth/index.showGate.bootState'); }
  setGateVisible(r, false);
  syncCookieConsentPlacement(true);
  /* A normal browser reaches the auth gate during first paint and during
   * local login flows.  Only tell the native shell that its cookie expired
   * when this is actually a WebView hand-off; otherwise a regular desktop
   * browser does not see an irrelevant bridge message. */
  if(isEmbeddedNativeWebView())notifyEmbeddedAuthExpired();
}

export function showAuthView(id, root){
  showView(root || document, id);
}

export function showAuthSignin(){switchAuthTab("signin")}
export function showAuthRegister(){switchAuthTab("register")}

export function switchAuthTab(tab, root){
  shellSwitchTab(root || document, tab);
}

/* Roving-tab keyboard behavior for the auth tablist. Kept as a public
 * bridge action so the declarative event map and the runtime window surface
 * share one implementation. */
export function focusAuthTab(el,e,root){
  if(!e||["ArrowLeft","ArrowUp","ArrowRight","ArrowDown","Home","End"].indexOf(e.key)===-1)return;
  if(focusTab(root || document, el, e.key)) e.preventDefault();
}

function clearAuthTabSelection(root){
  clearTabSelection(root || document);
}

export function setAuthError(viewId,msg,root){
  shellSetError(root || document, viewId, msg);
}

/* ── Forgot password / code-login views ── */

export function showAuthForgotPassword(root){
  var r = root || document;
  setValue(r, "authForgotEmail", getValue(r, "authSigninEmail"));
  showAuthView("authForgotPasswordView", r);
  clearAuthTabSelection(r);
}

export function showAuthCodeLogin(root){
  var r = root || document;
  setValue(r, "authCodeEmail", getValue(r, "authSigninEmail"));
  setVisible(r, "authCodeCodeWrap", false);
  setVisible(r, "authCodeSendBtn", true);
  setVisible(r, "authCodeLoginBtn", false);
  setVisible(r, "authCodeResendWrap", false);
  setText(r, "authCodeError", "");
  showAuthView("authCodeLoginView", r);
  clearAuthTabSelection(r);
}

/* The auth gate is still static markup, but it owns its own interactions.
 * Keeping these listeners here means the auth flow no longer depends on the
 * document-wide data-action dispatcher. The returned disposer makes the
 * mount safe for tests and for the later React auth-gate replacement. */
export function mountAuthListeners(){
  var gate=document.getElementById("authGate");
  if(!gate||gate.dataset.authListenersMounted==="1")return null;
  gate.dataset.authListenersMounted="1";
  var cleanups=[];

  function bind(selector,type,handler,options){
    gate.querySelectorAll(selector).forEach(function(el){
      el.addEventListener(type,handler,options);
      cleanups.push(function(){el.removeEventListener(type,handler,options)});
    });
  }

  bind(".auth-tab","click",function(e){
    switchAuthTab(e.currentTarget.getAttribute("data-tab"));
  });
  bind(".auth-tab","keydown",function(e){
    focusAuthTab(e.currentTarget,e);
  });

  function bindClick(selector,handler){
    bind(selector,"click",function(e){
      e.preventDefault();
      handler(e.currentTarget,e);
    });
  }

  function bindSubmit(selector,handler){
    bind(selector,"submit",function(e){
      e.preventDefault();
      handler(e);
    });
  }

  bindClick("#authSigninView .auth-inline-link-right",function(){showAuthForgotPassword()});
  bindClick("#authSigninView .auth-code-login-link",function(){showAuthCodeLogin()});
  bindClick("#authSigninView .auth-foot a",function(){switchAuthTab("register")});
  bindClick("#authRegisterView .auth-foot a",function(){showAuthSignin()});
  bindClick("#authVerifySentView button.auth-btn.secondary",function(){resendVerification()});
  bindClick("#authVerifySentView .auth-foot a",function(){showAuthSignin()});
  bindClick("#authVerifyFailedView .auth-foot a",function(){showAuthSignin()});
  bindClick("#authForgotPasswordView .auth-back-link",function(){showAuthSignin()});
  bindClick("#authForgotSentView .auth-foot a",function(){showAuthSignin()});
  bindClick("#authResetSuccessView button.auth-btn.primary",function(){showAuthSignin()});
  bindClick("#authCodeLoginView .auth-back-link",function(){showAuthSignin()});
  bindClick("#authCodeLoginView #authCodeResendWrap a",function(){resendAuthCode()});
  bindClick("#authCodeLoginView .auth-foot:not(#authCodeResendWrap) a",function(){showAuthSignin()});

  bindSubmit("#authSigninView",function(){submitAuthSignin()});
  bindSubmit("#authRegisterView",function(){submitAuthRegister()});
  bindSubmit("#authVerifyFailedView form",function(){resendVerification()});
  bindSubmit("#authForgotPasswordView",function(){submitAuthForgotPassword()});
  bindSubmit("#authResetPasswordView",function(){submitAuthResetPassword()});

  bindClick("#authCodeSendBtn",function(){submitAuthSendCode()});
  bindClick("#authCodeLoginBtn",function(){submitAuthLoginWithCode()});

  return function unmountAuthListeners(){
    cleanups.splice(0).forEach(function(cleanup){cleanup()});
    if(gate.dataset.authListenersMounted==="1")delete gate.dataset.authListenersMounted;
  };
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
export function revealAppAndHydrate(onHydrated){
  var hydration;
  try{ hydration=afterAuthEnter(); }catch(err){ hydration=Promise.reject(err); }
  hideGate();
  Promise.resolve(hydration)
    .catch(function(err){ try{console.error("[auth] post-auth hydration failed",err)}catch(e){reportSwallow(e, 'auth/index.hydrate.log'); } })
    .then(function(){ if(typeof onHydrated==="function")try{onHydrated()}catch(e){reportSwallow(e, 'auth/index.hydrate.onHydrated'); } });
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
  translate: (key) => window.t(key),
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
