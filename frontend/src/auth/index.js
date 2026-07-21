/* ── Authentication gate ──
   All UI for the auth gate: hide/show, tab switching, view switching,
   error display, and the various submit*Auth* form handlers.

   Extracted from main.js. Reads main.js globals via window (state,
   markAuthSuccess, CURRENT_USER, apiFetch, etc.) so this module
   remains independent.

   The authBoot IIFE (initial /api/auth/me check) and the
   handleAuthExpired callback STAY in main.js because they wire
   installAuthHooks() at boot and depend on the surrounding boot
   sequence. */

import { apiFetch } from '../util/api.js';

/* ── Gate display helpers ── */

export function hideGate(){
  var g=document.getElementById("authGate");if(g)g.classList.add("hidden");
  var s=document.getElementById("appShell");if(s)s.classList.remove("hidden");
  /* P0.6 — also flip the pre-boot data attribute so the CSS rules
     in <head> take over. From this point on, showGate()/hideGate()
     are the single source of truth for which view is on top. */
  try{document.documentElement.dataset.bootState="app"}catch(_){}
}

export function showGate(){
  /* Flip bootState first so the CSS rule hiding #authGate while
     data-boot-state="checking" is removed before we try to show it. */
  try{document.documentElement.dataset.bootState="auth"}catch(_){}
  var g=document.getElementById("authGate");if(g)g.classList.remove("hidden");
  var s=document.getElementById("appShell");if(s)s.classList.add("hidden");
}

export function showAuthView(id){
  ["authSigninView","authRegisterView","authVerifySentView","authVerifyFailedView","authVerifiedView","authForgotPasswordView","authForgotSentView","authResetPasswordView","authResetSuccessView","authCodeLoginView"].forEach(function(v){
    var el=document.getElementById(v);if(el)el.classList.add("hidden");
  });
  var el=document.getElementById(id);if(el)el.classList.remove("hidden");
}

export function showAuthSignin(){switchAuthTab("signin")}
export function showAuthRegister(){switchAuthTab("register")}

export function switchAuthTab(tab){
  document.querySelectorAll(".auth-tab").forEach(function(t){t.classList.toggle("active",t.getAttribute("data-tab")===tab)});
  showAuthView(tab==="signin"?"authSigninView":"authRegisterView");
}

export function setAuthError(viewId,msg){
  var el=document.getElementById(viewId);
  if(el)el.textContent=msg||"";
}

/* ── Forgot password / code-login views ── */

export function showAuthForgotPassword(){
  document.getElementById("authForgotEmail").value=document.getElementById("authSigninEmail").value;
  showAuthView("authForgotPasswordView");
  document.querySelectorAll(".auth-tab").forEach(function(t){t.classList.remove("active")});
}

export function showAuthCodeLogin(){
  document.getElementById("authCodeEmail").value=document.getElementById("authSigninEmail").value;
  document.getElementById("authCodeCodeWrap").classList.add("hidden");
  document.getElementById("authCodeSendBtn").classList.remove("hidden");
  document.getElementById("authCodeLoginBtn").classList.add("hidden");
  document.getElementById("authCodeResendWrap").classList.add("hidden");
  document.getElementById("authCodeError").textContent="";
  showAuthView("authCodeLoginView");
  document.querySelectorAll(".auth-tab").forEach(function(t){t.classList.remove("active")});
}

/* ── Post-auth hydration ──
   Runs after a successful signin/register/verify/code-login. Loads
   the user's projects, sessions, providers, memories, etc. Reads
   main.js globals via window. */
export async function afterAuthEnter(){
  window.toggleShareBtn&&window.toggleShareBtn();
  /* P_bleed-v2 — wipe the previous user's module-level caches
     BEFORE we start fetching the new user's data. Without this,
     the brief window between hideGate() and the completion of
     refreshServerSessions / refreshApiConfig would show the
     previous user's sessions in the sidebar or providers in the
     model picker. clearPerUserClientState also re-renders the
     affected UI surfaces (renderRecents, renderProviderList) so
     the empty state appears immediately. */
  if(typeof window.clearPerUserClientState==="function"){
    try{window.clearPerUserClientState()}catch(e){/* ignore */}
  }
  /* Run the localStorage -> server migration once if there's anything to bring. */
  try{
    var localApi=localStorage.getItem("socrates-api");
    var localSessions=localStorage.getItem("socrates-sessions-v2");
    var payload={};
    var hasAny=false;
    if(localSessions){try{var arr=JSON.parse(localSessions);if(Array.isArray(arr)&&arr.length){payload.localSessions=arr;hasAny=true}}catch(_){}}
    if(localApi){try{var o=JSON.parse(localApi);if(o&&o.providers&&o.providers.length){var p=o.providers.find(function(x){return x.id===o.activeId})||o.providers[0];if(p&&p.key){payload.localApi={label:p.label,url:p.url,model:p.model,key:p.key};hasAny=true}}}catch(_){}}
    if(hasAny){
      try{
        await apiFetch("/api/migrate",{method:"POST",body:payload});
        try{localStorage.removeItem("socrates-sessions-v2")}catch(_){}
        try{localStorage.removeItem("socrates-api")}catch(_){}
      }catch(e){/* migrate failed */}
    }
  }catch(e){/* migrate setup failed */}
  /* Boot-time data fetch helper — calls a `fn` once; if it throws
     an ApiError(401) DURING the post-login grace window
     (isInAuthGraceWindow), the brand-new `sid` cookie may not have
     reached the browser's cookie jar yet, which would silently
     leave the model picker and Recents list empty. Retry once
     after ~500 ms to give the cookie time to commit. Outside the
     grace window, a 401 means the session is genuinely gone and
     we let the error bubble so handleAuthExpired() can show the
     sign-in gate.

     Reused for any future "data needed immediately after sign-in"
     endpoint (mistakes, memories, projects, …). */
  async function bootFetch(label, fn){
    if(typeof fn!=="function")return null;
    try{
      var r=await fn();
      return r;
    }catch(e){
      var isGrace=typeof window.isInAuthGraceWindow==="function" && window.isInAuthGraceWindow();
      if(!isGrace || !e || e.status!==401) throw e;
      await new Promise(function(res){setTimeout(res,500)});
      try{
        var r2=await fn();
        return r2;
      }catch(e2){
        /* Re-throw so handleAuthExpired() can take over — better
           than showing the user an empty picker while their real
           session is still alive. */
        throw e2;
      }
    }
  }
  /* Pull the user's server-side chat sessions into the local cache. */
  await bootFetch("refreshServerSessions", window.refreshServerSessions);
  /* Load the user's saved API providers and model configs.
     Wrap the call so the `await` waits for the returned Promise;
     bootFetch retries 401s during the grace window so the model
     picker isn't left empty when the sid cookie is still settling. */
  var _r=await bootFetch("refreshApiConfig", window.refreshApiConfig);
  /* Load the user's saved memories for long-term context. AWAIT this
     so the first chat request the user fires after sign-in sees their
     own memories (and not the previous user's, which would otherwise
     be visible during the fire-and-forget window). loadUserMemories
     also clears _userMemories before fetching, so awaiting is safe
     even if the request fails. */
  try{await window.loadUserMemories()}catch(_){/* handled inside */}
  /* Update sidebar footer with user info. */
  window.renderUserFooter&&window.renderUserFooter();
  /* P_chatgpt-landing — once the user object is on window, paint the
     personalized greeting on the landing screen, and wire the mic
     buttons so they respond to clicks immediately. */
  try {
    if (typeof window.renderGreeting === "function") window.renderGreeting();
    if (typeof window.wireVoiceInput === "function") window.wireVoiceInput();
  } catch (_) { /* first-paint helpers — never block sign-in */ }
  /* Re-render sidebar lists now that the cache is fresh. */
  window.renderRecents&&window.renderRecents();
  window.renderMistakes&&window.renderMistakes();
  window.updateMistakesBadge&&window.updateMistakesBadge();
  window.renderProviderList&&window.renderProviderList();
  window.syncModelPills&&window.syncModelPills();
  window.syncExtensionsUI&&window.syncExtensionsUI();
  window.syncAppModeUI&&window.syncAppModeUI();
  window.syncSidebarForMode&&window.syncSidebarForMode();
  /* If the URL carries a chat session ID, load it. Otherwise, stay on the
     main page (topic setup) — no session exists until the user clicks Begin.
     P_exam-route — exam sessions live under a different query key
     (?exam=<uuid>) so a pasted chat link can't accidentally open an exam
     and vice versa. Both keys share the /api/sessions/<id> endpoint, so
     loadSession() handles either via its existing kind==='exam' branch. */
  var chatId=window.getChatIdFromURL&&window.getChatIdFromURL();
  var examId=window.getExamIdFromURL&&window.getExamIdFromURL();
  var state=window.state;
  if(chatId){
    try{await window.loadSession(chatId)}catch(e){/* failed to load session */
      state.currentSessionId=null;
      window.setChatIdInURL&&window.setChatIdInURL(null);
    }
  }else if(examId){
    try{await window.loadSession(examId)}catch(e){/* failed to load session */
      state.currentSessionId=null;
      window.setExamIdInURL&&window.setExamIdInURL(null);
    }
  }
  /* Trigger initial data load. */
  if(typeof window.initialLoad==="function")window.initialLoad();
  else{
    /* Fallback: re-render whatever the current view is. */
    if(typeof window.renderRecents==="function")window.renderRecents();
    if(typeof window.renderMistakes==="function"){window.renderMistakes();window.updateMistakesBadge&&window.updateMistakesBadge()}
  }
}

/* ── Submit handlers ── */

export async function submitAuthSignin(){
  var email=document.getElementById("authSigninEmail").value.trim();
  var password=document.getElementById("authSigninPassword").value;
  var guest=document.getElementById("authGuestCheckbox").checked;
  setAuthError("authSigninError","");
  if(!email||!password)return setAuthError("authSigninError","Please enter your email and password.");
  var btn=document.getElementById("authSigninBtn");btn.disabled=true;btn.textContent="Signing in…";
  var markAuthSuccess=window.markAuthSuccess;
  try{
    var r=await apiFetch("/api/auth/login",{method:"POST",_authEndpoint:true,body:{email,password}});
    if(guest)try{localStorage.setItem("socrates-guest","1")}catch(e){}
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
      }catch(__){ /* still nothing — proceed with what we have */ }
    }
    await afterAuthEnter();
    hideGate();
  }catch(e){
    showGate();
    if(e.status===403 && e.code==="UNVERIFIED"){
      document.getElementById("authVerifyEmail").textContent=email;
      try{document.getElementById("authResendEmail").value=email}catch(_){}
      showAuthView("authVerifySentView");
      return;
    }
    setAuthError("authSigninError",e.status===401?t("auth.wrongCredentials"):(t("auth.loginFailedPrefix")+e.message));
  }finally{
    btn.disabled=false;btn.textContent=t("auth.signIn");
  }
}

export async function submitAuthRegister(){
  var email=document.getElementById("authRegisterEmail").value.trim();
  var password=document.getElementById("authRegisterPassword").value;
  setAuthError("authRegisterError","");
  if(!email)return setAuthError("authRegisterError",t("auth.pleaseEnterEmail"));
  if(!password||password.length<8)return setAuthError("authRegisterError",t("auth.passwordTooShort"));
  var btn=document.getElementById("authRegisterBtn");btn.disabled=true;btn.textContent=t("auth.sending");
  try{
    /* The server stores the registration as pending and sends a
       verification email. No account or session is created until
       the user clicks the link in the email. */
    var r=await apiFetch("/api/auth/register",{method:"POST",_authEndpoint:true,body:{email,password}});
    /* Always show the "verification sent" view — no auto-login. */
    document.getElementById("authVerifyEmail").textContent=email;
    var resendEl=document.getElementById("authResendEmail");
    if(resendEl)resendEl.value=email;
    showAuthView("authVerifySentView");
    document.querySelectorAll(".auth-tab").forEach(function(t){t.classList.remove("active")});
  }catch(e){
    setAuthError("authRegisterError",e.status===409?"That email is already registered. Try signing in.":e.message);
  }finally{
    btn.disabled=false;btn.textContent=t("auth.sendVerificationLink");
  }
}

export async function resendVerification(){
  var emailEl=document.getElementById("authResendEmail");
  var email=emailEl?emailEl.value.trim():"";
  if(!email)return;
  setAuthError("authVerifyFailedError","");
  try{
    /* Dedicated resend endpoint — never send a hard-coded password
       to /register (it would let anyone who knows the email log in
       with that password if the account is later activated). */
    var body={email};
    await apiFetch("/api/auth/resend-verification",{method:"POST",body:body});
    document.getElementById("authVerifyEmail").textContent=email;
    showAuthView("authVerifySentView");
  }catch(e){
    setAuthError("authVerifyFailedError",e.message);
  }
}

export async function submitAuthVerify(token){
  /* Show the "verifying…" state immediately, while we hit the API. */
  showAuthView("authVerifiedView");
  document.querySelectorAll(".auth-tab").forEach(function(t){t.classList.remove("active")});
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
        }catch(__){ /* fall through with what we have */ }
      }
    }
    await afterAuthEnter();
    hideGate();
  }catch(e){
    var title="This link is invalid or expired";
    var msg="Verification links expire after 24 hours. Enter your email and we'll send a fresh one.";
    if(e.status===400&&e.code==="EXPIRED"){
      title="This link has expired";
      msg="Verification links expire after 24 hours. Enter your email and we'll send a fresh one.";
    }
    document.getElementById("authVerifyFailedTitle").textContent=title;
    document.getElementById("authVerifyFailedMsg").textContent=msg;
    showAuthView("authVerifyFailedView");
  }
}

export async function submitAuthForgotPassword(){
  var email=document.getElementById("authForgotEmail").value.trim();
  setAuthError("authForgotError","");
  if(!email)return setAuthError("authForgotError",t("auth.pleaseEnterEmail"));
  var btn=document.getElementById("authForgotBtn");btn.disabled=true;btn.textContent=t("auth.sending");
  try{
    await apiFetch("/api/auth/forgot-password",{method:"POST",_authEndpoint:true,body:{email}});
    document.getElementById("authForgotSentEmail").textContent=email;
    showAuthView("authForgotSentView");
  }catch(e){
    setAuthError("authForgotError",e.message);
  }finally{
    btn.disabled=false;btn.textContent=t("auth.sendResetLink");
  }
}

export async function submitAuthResetPassword(){
  var password=document.getElementById("authResetPassword").value;
  var confirm=document.getElementById("authResetConfirm").value;
  setAuthError("authResetError","");
  if(!password||password.length<8)return setAuthError("authResetError",t("auth.passwordTooShort"));
  if(password!==confirm)return setAuthError("authResetError",t("auth.passwordsDontMatch"));
  var btn=document.getElementById("authResetBtn");btn.disabled=true;btn.textContent=t("auth.resetting");
  try{
    await apiFetch("/api/auth/reset-password",{method:"POST",body:{token:window.__resetToken,password}});
    showAuthView("authResetSuccessView");
  }catch(e){
    setAuthError("authResetError",e.message);
  }finally{
    btn.disabled=false;btn.textContent=t("auth.resetPassword");
  }
}

export async function submitAuthSendCode(){
  var email=document.getElementById("authCodeEmail").value.trim();
  setAuthError("authCodeError","");
  if(!email)return setAuthError("authCodeError",t("auth.pleaseEnterEmail"));
  var btn=document.getElementById("authCodeSendBtn");btn.disabled=true;btn.textContent=t("auth.sending");
  try{
    await apiFetch("/api/auth/send-code",{method:"POST",_authEndpoint:true,body:{email}});
    document.getElementById("authCodeCodeWrap").classList.remove("hidden");
    document.getElementById("authCodeSentEmail").textContent=email;
    document.getElementById("authCodeSentMsg").classList.remove("hidden");
    document.getElementById("authCodeSendBtn").classList.add("hidden");
    document.getElementById("authCodeLoginBtn").classList.remove("hidden");
    document.getElementById("authCodeResendWrap").classList.remove("hidden");
    document.getElementById("authCodeInput").focus();
  }catch(e){
    setAuthError("authCodeError",e.message);
  }finally{
    btn.disabled=false;btn.textContent=t("auth.sendCode");
  }
}

export async function submitAuthLoginWithCode(){
  var email=document.getElementById("authCodeEmail").value.trim();
  var code=document.getElementById("authCodeInput").value.trim();
  var guest=document.getElementById("authCodeGuestCheckbox").checked;
  setAuthError("authCodeError","");
  if(!code||code.length!==6)return setAuthError("authCodeError","Please enter the 6-digit code.");
  var btn=document.getElementById("authCodeLoginBtn");btn.disabled=true;btn.textContent="Logging in…";
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
    if(guest)try{localStorage.setItem("socrates-guest","1")}catch(e){}
    await afterAuthEnter();
    hideGate();
  }catch(e){
    setAuthError("authCodeError",e.message);
  }finally{
    btn.disabled=false;btn.textContent=t("auth.logIn");
  }
}

export async function resendAuthCode(){
  var email=document.getElementById("authCodeEmail").value.trim();
  if(!email)return;
  try{
    await apiFetch("/api/auth/send-code",{method:"POST",_authEndpoint:true,body:{email}});
  }catch(_){ /* swallow — user can retry from the UI */ }
}
