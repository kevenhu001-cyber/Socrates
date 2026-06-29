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
  /* P2.1 — hydrate the project list from localStorage and
     paint the chip row. Server-side /api/projects is
     fire-and-forget after this; local copy is the source of
     truth until that endpoint is live. */
  window.loadProjects&&window.loadProjects();
  window.renderProjects&&window.renderProjects();
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
        try{localStorage.removeItem("socrates-websearch")}catch(_){}
      }catch(e){console.warn("[migrate]",e.message)}
    }
  }catch(e){console.warn("[migrate] setup",e.message)}
  /* Pull the user's server-side chat sessions into the local cache. */
  await window.refreshServerSessions&&window.refreshServerSessions();
  /* Load the user's saved API providers and model configs. */
  await window.refreshApiConfig&&window.refreshApiConfig();
  /* Load the user's saved memories for long-term context. */
  window.loadUserMemories&&window.loadUserMemories();
  /* Update sidebar footer with user info. */
  window.renderUserFooter&&window.renderUserFooter();
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
     main page (topic setup) — no session exists until the user clicks Begin. */
  var chatId=window.getChatIdFromURL&&window.getChatIdFromURL();
  var state=window.state;
  if(chatId){
    try{await window.loadSession(chatId)}catch(e){
      console.warn("[boot] failed to load session from URL:",chatId,e&&e.message);
      state.currentSessionId=null;
      window.setChatIdInURL&&window.setChatIdInURL(null);
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
    /* Build 2026-06-09b: /login now returns the full user shape (incl.
       verifiedAt). Log it so a hard-refresh test can confirm the new
       payload is reaching the browser. */
    console.log("[boot/build 2026-06-09b] login.user =", JSON.stringify(r.user).substring(0, 300));
    /* Start the post-auth grace window + adopt the canonical user
       object from /me. This avoids the "Guest / Not signed in"
       flash that happens when background calls hit the server
       before the Set-Cookie has fully propagated. */
    markAuthSuccess&&markAuthSuccess();
    try{
      var me=await apiFetch("/api/auth/me",{_authEndpoint:true});
      window.setCurrentUser((me&&me.user)?me.user:r.user);
      console.log("[boot/build 2026-06-09b] /me.user =", JSON.stringify(me.user).substring(0, 300));
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
    setAuthError("authSigninError",e.status===401?"Wrong email or password.":("Login failed: "+e.message));
  }finally{
    btn.disabled=false;btn.textContent="Sign in";
  }
}

export async function submitAuthRegister(){
  var email=document.getElementById("authRegisterEmail").value.trim();
  var password=document.getElementById("authRegisterPassword").value;
  setAuthError("authRegisterError","");
  if(!email)return setAuthError("authRegisterError","Please enter your email.");
  if(!password||password.length<8)return setAuthError("authRegisterError","Password must be at least 8 characters.");
  var btn=document.getElementById("authRegisterBtn");btn.disabled=true;btn.textContent="Sending…";
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
    btn.disabled=false;btn.textContent="Send verification link";
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
  if(!email)return setAuthError("authForgotError","Please enter your email.");
  var btn=document.getElementById("authForgotBtn");btn.disabled=true;btn.textContent="Sending…";
  try{
    await apiFetch("/api/auth/forgot-password",{method:"POST",_authEndpoint:true,body:{email}});
    document.getElementById("authForgotSentEmail").textContent=email;
    showAuthView("authForgotSentView");
  }catch(e){
    setAuthError("authForgotError",e.message);
  }finally{
    btn.disabled=false;btn.textContent="Send reset link";
  }
}

export async function submitAuthResetPassword(){
  var password=document.getElementById("authResetPassword").value;
  var confirm=document.getElementById("authResetConfirm").value;
  setAuthError("authResetError","");
  if(!password||password.length<8)return setAuthError("authResetError","Password must be at least 8 characters.");
  if(password!==confirm)return setAuthError("authResetError","Passwords don't match.");
  var btn=document.getElementById("authResetBtn");btn.disabled=true;btn.textContent="Resetting…";
  try{
    await apiFetch("/api/auth/reset-password",{method:"POST",body:{token:window.__resetToken,password}});
    showAuthView("authResetSuccessView");
  }catch(e){
    setAuthError("authResetError",e.message);
  }finally{
    btn.disabled=false;btn.textContent="Reset password";
  }
}

export async function submitAuthSendCode(){
  var email=document.getElementById("authCodeEmail").value.trim();
  setAuthError("authCodeError","");
  if(!email)return setAuthError("authCodeError","Please enter your email.");
  var btn=document.getElementById("authCodeSendBtn");btn.disabled=true;btn.textContent="Sending…";
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
    btn.disabled=false;btn.textContent="Send code";
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
    btn.disabled=false;btn.textContent="Log in";
  }
}

export async function resendAuthCode(){
  var email=document.getElementById("authCodeEmail").value.trim();
  if(!email)return;
  try{
    await apiFetch("/api/auth/send-code",{method:"POST",_authEndpoint:true,body:{email}});
  }catch(_){ /* swallow — user can retry from the UI */ }
}
