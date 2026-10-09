/* ── Authentication gate ──
   All UI for the auth gate: hide/show, tab switching, view switching,
   error display, and the various submit*Auth* form handlers.

   Extracted from main.js. Reads main.js globals via window (state,
   markAuthSuccess, CURRENT_USER, apiFetch, etc.) so this module
   remains independent.

   The initial /api/auth/me sequence lives in ./boot.js; the auth-expired
   callback stays with the application lifecycle because it coordinates
   session teardown before returning the user to this gate. */

import { apiFetch } from '../util/api.js';
import { notifyEmbeddedAuthExpired } from '../native/mobileWebSessionBridge.js';
import { syncCookieConsentPlacement } from '../cookieConsent.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { afterAuthEnter } from './postAuth.js';

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
   working while form handlers migrate in later M4 increments. */

import { setGateVisible, setBootState, showView, switchTab as shellSwitchTab, focusTab, clearTabSelection, setError as shellSetError, getValue, isChecked, setValue, setText, setVisible, focusId, setButton } from './shell.ts';

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

/* ── Submit handlers ── */

export async function submitAuthSignin(root){
  var r = root || document;
  var email=getValue(r, "authSigninEmail").trim();
  var password=getValue(r, "authSigninPassword");
  var guest=isChecked(r, "authGuestCheckbox");
  setAuthError("authSigninError","",r);
  if(!email||!password)return setAuthError("authSigninError","Please enter your email and password.",r);
  setButton(r, "authSigninBtn", true, t("auth.signingIn"));
  var markAuthSuccess=window.markAuthSuccess;
  try{
    var r=await apiFetch("/api/auth/login",{method:"POST",_authEndpoint:true,body:{email,password}});
    if(guest)try{localStorage.setItem("socrates-guest","1")}catch(e){reportSwallow(e, 'auth/index.submitAuthSignin.markGuest'); }
    markAuthSuccess&&markAuthSuccess();
    try{
      var me=await apiFetch("/api/auth/me",{_authEndpoint:true});
      window.setCurrentUser((me&&me.user)?me.user:r.user);
    }catch(_){
      /* /me is the source of truth for the user object (tier,
         preferences, etc.). If it fails after a successful login,
         something is wrong with the new session — fall back to
         the login response but DON'T proceed into the app until
         we've at least confirmed the session is alive on a retry. */
      window.setCurrentUser(r.user);
      try{
        await new Promise(function(r2){setTimeout(r2,150)});
        var me2=await apiFetch("/api/auth/me",{_authEndpoint:true});
        if(me2&&me2.user)window.setCurrentUser(me2.user);
      }catch(e){ reportSwallow(e, 'auth/index.submitAuthSignin.recheckMe'); /* still nothing — proceed with what we have */ }
    }
    revealAppAndHydrate();
  }catch(e){
    showGate(r);
    if(e.status===403 && e.code==="UNVERIFIED"){
      setText(r, "authVerifyEmail", email);
      try{setValue(r, "authResendEmail", email)}catch(e){reportSwallow(e, 'auth/index.submitAuthSignin.prefillResendEmail'); }
      showAuthView("authVerifySentView", r);
      return;
    }
    setAuthError("authSigninError",e.status===401?t("auth.wrongCredentials"):(t("auth.loginFailedPrefix")+e.message),r);
  }finally{
    setButton(r, "authSigninBtn", false, t("auth.signIn"));
  }
}

export async function submitAuthRegister(root){
  var r = root || document;
  var email=getValue(r, "authRegisterEmail").trim();
  var password=getValue(r, "authRegisterPassword");
  setAuthError("authRegisterError","",r);
  if(!email)return setAuthError("authRegisterError",t("auth.pleaseEnterEmail"),r);
  if(!password||password.length<8)return setAuthError("authRegisterError",t("auth.passwordTooShort"),r);
  setButton(r, "authRegisterBtn", true, t("auth.sending"));
  try{
    /* The server stores the registration as pending and sends a
       verification email. No account or session is created until
       the user clicks the link in the email. */
    await apiFetch("/api/auth/register",{method:"POST",_authEndpoint:true,body:{email,password}});
    /* Always show the "verification sent" view — no auto-login. */
    setText(r, "authVerifyEmail", email);
    setValue(r, "authResendEmail", email);
    showAuthView("authVerifySentView", r);
    clearAuthTabSelection(r);
  }catch(e){
    setAuthError("authRegisterError",e.status===409?"That email is already registered. Try signing in.":e.message,r);
  }finally{
    setButton(r, "authRegisterBtn", false, t("auth.sendVerificationLink"));
  }
}

export async function resendVerification(root){
  var r = root || document;
  var email=getValue(r, "authResendEmail").trim();
  if(!email)return;
  setAuthError("authVerifyFailedError","",r);
  try{
    /* Dedicated resend endpoint — never send a hard-coded password
       to /register (it would let anyone who knows the email log in
       with that password if the account is later activated). */
    var body={email};
    await apiFetch("/api/auth/resend-verification",{method:"POST",body:body});
    setText(r, "authVerifyEmail", email);
    showAuthView("authVerifySentView", r);
  }catch(e){
    setAuthError("authVerifyFailedError",e.message,r);
  }
}

export async function submitAuthVerify(token){
  /* Show the "verifying…" state immediately, while we hit the API. */
  showAuthView("authVerifiedView");
  clearAuthTabSelection();
  var markAuthSuccess=window.markAuthSuccess;
  try{
    var r=await apiFetch("/api/auth/verify?token="+encodeURIComponent(token));
    /* Verification creates the user account (from pending registration)
       and starts a session. Adopt the canonical user object from the
       response or /me to enter the app. */
    markAuthSuccess&&markAuthSuccess();
    try{
      var me=await apiFetch("/api/auth/me",{_authEndpoint:true});
      window.setCurrentUser((me&&me.user)?me.user:((r&&r.user)?r.user:null));
    }catch(_){
      window.setCurrentUser((r&&r.user)?r.user:null);
      if(window.CURRENT_USER){
        try{
          await new Promise(function(r2){setTimeout(r2,150)});
          var me2=await apiFetch("/api/auth/me",{_authEndpoint:true});
          if(me2&&me2.user)window.setCurrentUser(me2.user);
        }catch(e){ reportSwallow(e, 'auth/index.submitAuthLoginWithCode.recheckMe'); /* fall through with what we have */ }
      }
    }
    revealAppAndHydrate();
  }catch(e){
    var title=t("auth.verifyFailedTitle");
    var msg=t("auth.verifyFailedMsg");
    if(e.status===400&&e.code==="EXPIRED"){
      title=t("auth.verifyFailedExpiredTitle");
      msg=t("auth.verifyFailedMsg");
    }
    setText(document, "authVerifyFailedTitle", title);
    setText(document, "authVerifyFailedMsg", msg);
    showAuthView("authVerifyFailedView");
  }
}

export async function submitAuthForgotPassword(root){
  var r = root || document;
  var email=getValue(r, "authForgotEmail").trim();
  setAuthError("authForgotError","",r);
  if(!email)return setAuthError("authForgotError",t("auth.pleaseEnterEmail"),r);
  setButton(r, "authForgotBtn", true, t("auth.sending"));
  try{
    await apiFetch("/api/auth/forgot-password",{method:"POST",_authEndpoint:true,body:{email}});
    setText(r, "authForgotSentEmail", email);
    showAuthView("authForgotSentView", r);
  }catch(e){
    setAuthError("authForgotError",e.message,r);
  }finally{
    setButton(r, "authForgotBtn", false, t("auth.sendResetLink"));
  }
}

export async function submitAuthResetPassword(root){
  var r = root || document;
  var password=getValue(r, "authResetPassword");
  var confirm=getValue(r, "authResetConfirm");
  setAuthError("authResetError","",r);
  if(!password||password.length<8)return setAuthError("authResetError",t("auth.passwordTooShort"),r);
  if(password!==confirm)return setAuthError("authResetError",t("auth.passwordsDontMatch"),r);
  setButton(r, "authResetBtn", true, t("auth.resetting"));
  try{
    await apiFetch("/api/auth/reset-password",{method:"POST",body:{token:window.__resetToken,password}});
    showAuthView("authResetSuccessView", r);
  }catch(e){
    setAuthError("authResetError",e.message,r);
  }finally{
    setButton(r, "authResetBtn", false, t("auth.resetPassword"));
  }
}

export async function submitAuthSendCode(root){
  var r = root || document;
  var email=getValue(r, "authCodeEmail").trim();
  setAuthError("authCodeError","",r);
  if(!email)return setAuthError("authCodeError",t("auth.pleaseEnterEmail"),r);
  setButton(r, "authCodeSendBtn", true, t("auth.sending"));
  try{
    await apiFetch("/api/auth/send-code",{method:"POST",_authEndpoint:true,body:{email}});
    setVisible(r, "authCodeCodeWrap", true);
    setText(r, "authCodeSentEmail", email);
    setVisible(r, "authCodeSentMsg", true);
    setVisible(r, "authCodeSendBtn", false);
    setVisible(r, "authCodeLoginBtn", true);
    setVisible(r, "authCodeResendWrap", true);
    focusId(r, "authCodeInput");
  }catch(e){
    setAuthError("authCodeError",e.message,r);
  }finally{
    setButton(r, "authCodeSendBtn", false, t("auth.sendCode"));
  }
}

export async function submitAuthLoginWithCode(root){
  var r = root || document;
  var email=getValue(r, "authCodeEmail").trim();
  var code=getValue(r, "authCodeInput").trim().toUpperCase();
  var guest=isChecked(r, "authCodeGuestCheckbox");
  setAuthError("authCodeError","",r);
  /* Login codes are eight unambiguous alphanumeric characters
     (server/lib/crypto.ts). Keep the client validator in lockstep so it
     never rejects a valid code before it reaches the server. */
  if(!/^[A-HJ-KM-NP-Z2-9]{8}$/.test(code))return setAuthError("authCodeError","Please enter the 8-character code.",r);
  setButton(r, "authCodeLoginBtn", true, t("auth.loggingIn"));
  var markAuthSuccess=window.markAuthSuccess;
  try{
    var r=await apiFetch("/api/auth/login-with-code",{method:"POST",_authEndpoint:true,body:{email,code}});
    markAuthSuccess&&markAuthSuccess();
    try{
      var me=await apiFetch("/api/auth/me",{_authEndpoint:true});
      window.setCurrentUser((me&&me.user)?me.user:r.user);
    }catch(_){
      window.setCurrentUser(r.user);
    }
    if(guest)try{localStorage.setItem("socrates-guest","1")}catch(e){reportSwallow(e, 'auth/index.submitAuthLoginWithCode.markGuest'); }
    revealAppAndHydrate();
  }catch(e){
    setAuthError("authCodeError",e.message,r);
  }finally{
    setButton(r, "authCodeLoginBtn", false, t("auth.logIn"));
  }
}

export async function resendAuthCode(root){
  var email=getValue(root || document, "authCodeEmail").trim();
  if(!email)return;
  try{
    await apiFetch("/api/auth/send-code",{method:"POST",_authEndpoint:true,body:{email}});
  }catch(e){ reportSwallow(e, 'auth/index.sendAuthCode'); /* swallow — user can retry from the UI */ }
}
