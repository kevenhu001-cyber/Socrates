/* ── Auth boot sequence ──
   Runs once on page load. Handles:
   - URL params: oauth_error, error, share, token (verify), reset_token
   - /api/config probe (for built-in Beagle key)
   - /api/auth/me retry loop (3 attempts, 500ms backoff)
   - Branching to gate or app shell
   Reads main.js globals via window (BEAGLE_BUILT_IN, CURRENT_USER,
   apiFetch, etc.). */

import { apiFetch } from '../util/api.js';
import { showToast } from '../ui/toast.js';
import { openMobileTargetFromUrl } from '../native/mobileWebSessionBridge.js';

import { loadSharedSession } from '../ui/share.js';

import { showAuthView, submitAuthVerify, afterAuthEnter } from './index.js';

import { renderUserFooter } from '../ui/profile.js';

/* Hoisted flag — `var` so it's available to refreshApiConfig()
   even if the boot IIFE completes before that function is defined. */
export var SERVER_HAS_BEAGLE_KEY=false;

async function loadPublicConfig(){
  var cfgOk=false;
  try{
    var cfg=await fetch("/api/v2/config",{credentials:"include"}).then(function(r){return r.json()}).catch(function(){return{}});
    if(cfg&&cfg.hasBeagleKey){
      var builtIn=window.BEAGLE_BUILT_IN;
      if(builtIn){
        if(typeof cfg.beagleKey==="string")builtIn.key=cfg.beagleKey;
        if(typeof cfg.beagleModel==="string")builtIn.model=cfg.beagleModel;
      }
      cfgOk=true;
    }
    try { window.BEAGLE_IS_REASONING = cfg && cfg.isReasoning === true; } catch (_) {}
  }catch(_){/* config fetch failed */}
  SERVER_HAS_BEAGLE_KEY=cfgOk;
  try { window.SERVER_HAS_BEAGLE_KEY = cfgOk; } catch (_) {}
  return cfgOk;
}

async function loadCurrentUser(){
  var me=null;
  for(var meAttempt=1;meAttempt<=3;meAttempt++){
    try{
      me=await apiFetch("/api/auth/me",{_authEndpoint:true});
      break;
    }catch(e){
      if(e&&e.status===401){
        if(meAttempt<3){
          await new Promise(function(r){setTimeout(r,500)});
          continue;
        }
        return {unauthorized:true,user:null};
      }
      if(meAttempt<3)await new Promise(function(r){setTimeout(r,500)});
    }
  }
  return {unauthorized:false,user:me&&me.user?me.user:null};
}

export async function authBoot(){
  /* CSRF priming is required before mutations, but it is independent of the
     read-only identity/config probes.  Starting it here removes one full RTT
     from the signed-in cold-start path. */
  var csrfReady=fetch("/api/v2/auth/csrf-token",{credentials:"include"}).catch(function(){});
  var params=new URLSearchParams(location.search);
  /* P_local-dev-bypass — when the app is served from localhost (vite dev
   * server, `npm run dev`) append `?dev=1` to skip the sign-in flow.
   * The hostname guard means this branch is unreachable on any deployed
   * host, so the bypass cannot be exercised in production. */
  if(params.get("dev")==="1"&&/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)){
    history.replaceState(null,"",location.pathname+(params.get("next")?"?next="+encodeURIComponent(params.get("next")):""));
    try{
      var BEAGLE_BUILT_IN=window.BEAGLE_BUILT_IN;
      if(BEAGLE_BUILT_IN&&!BEAGLE_BUILT_IN.key){BEAGLE_BUILT_IN.key="local";BEAGLE_BUILT_IN.model="local";}
      window.SERVER_HAS_BEAGLE_KEY=true;
    }catch(_){}
    var devUser={id:"local-dev",name:"Local Dev",email:"dev@local",plan:"local",isLocal:true};
    if(typeof window.setCurrentUser==="function")window.setCurrentUser(devUser);
    else window.CURRENT_USER=devUser;
    try{window.markAuthSuccess&&window.markAuthSuccess()}catch(_){}
    if(typeof afterAuthEnter==="function")try{await afterAuthEnter({configReady:Promise.resolve(true),csrfReady:csrfReady})}catch(_){}
    window.hideGate&&window.hideGate();
    try{performance.mark("socrates:shell-visible")}catch(_){}
    return;
  }
  var oauthError=params.get("oauth_error");
  if(oauthError){
    history.replaceState(null,"",location.pathname);
    window.showGate&&window.showGate();
    window.showAuthSignin&&window.showAuthSignin();
    var msg="GitHub login failed: "+decodeURIComponent(oauthError)+".";
    setTimeout(function(){try{showToast(msg,5000)}catch(_){}},500);
    return;
  }
  /* Also handle plain ?error= for backward compatibility. */
  var plainError=params.get("error");
  if(plainError){
    history.replaceState(null,"",location.pathname);
    window.showGate&&window.showGate();
    window.showAuthSignin&&window.showAuthSignin();
  }

  var shareToken=params.get("share");
  if(shareToken){
    /* Shared session view — load immediately, no auth needed for public. */
    history.replaceState(null,"",location.pathname);
    try{
      var sharePromise = loadSharedSession(shareToken);
      if (sharePromise && typeof sharePromise.then === "function") {
        await sharePromise;
      }
    }catch(_){}
    return;
  }

  var token=params.get("token");
  var resetToken=params.get("reset_token");
  /* Verification link — consume token first. */
  if(token){
    history.replaceState(null,"",location.pathname+(params.get("redirect")?"?redirect="+encodeURIComponent(params.get("redirect")):""));
    window.showGate&&window.showGate();
    if(typeof submitAuthVerify==="function")await submitAuthVerify(token);
    return;
  }
  /* Password reset link — show the reset form immediately. */
  if(resetToken){
    history.replaceState(null,"",location.pathname);
    window.showGate&&window.showGate();
    window.__resetToken=resetToken;
    showAuthView&&showAuthView("authResetPasswordView");
    document.querySelectorAll(".auth-tab").forEach(function(t){
      t.classList.remove("active");
      t.setAttribute("aria-selected","false");
      t.setAttribute("tabindex","-1");
    });
    /* Prefill the hidden email field by asking the server which
       account this token belongs to. The hidden field exists so
       password managers + screen readers see a username on the same
       form as the password fields (a11y requirement). */
    (async function(){
      try{
        var info=await apiFetch("/api/auth/reset-info?token="+encodeURIComponent(resetToken));
        var el=document.getElementById("authResetEmail");
        if(el&&info&&info.email)el.value=info.email;
      }catch(_){ /* leave empty; form still works */ }
    })();
    return;
  }
  /* Config and identity are independent reads. The shell waits only for
     identity; provider hydration awaits config in the background. */
  var configReady=loadPublicConfig();
  var identity=await loadCurrentUser();

  /* P0.0 — only route the user to the auth gate when the server
   * explicitly says 401. Network blips, 5xx, and a missing
   * `/api/auth/me` response must NOT silently log the user out, or
   * a transient hiccup on a refresh will force them back through
   * the sign-in flow. We retry once after 500ms on transient
   * failures, then show a "couldn't reach the server" toast and
   * stop on the topic-setup shell so the user can try again. */
  if(identity.unauthorized){
    window.showGate&&window.showGate();
    window.showAuthSignin&&window.showAuthSignin();
    return;
  }
  if(identity.user){
    if(typeof window.setCurrentUser==="function")window.setCurrentUser(identity.user);
    else window.CURRENT_USER=identity.user;
    /* Grace window for the Set-Cookie to settle (see notes in
     * markAuthSuccess). */
    try{window.markAuthSuccess&&window.markAuthSuccess()}catch(_){}
    if(typeof afterAuthEnter==="function")await afterAuthEnter({configReady:configReady,csrfReady:csrfReady});
    window.hideGate&&window.hideGate();
    try{performance.mark("socrates:shell-visible")}catch(_){}
    /* The one-time mobile web-session consume route leaves an allow-listed
       target in the query. Open it only after normal authenticated hydration
       so its list data and controls match a first-party browser visit. */
    openMobileTargetFromUrl();
    return;
  }
  /* /me never resolved with a user — surface a visible error and
   * leave the user on the existing app shell so they can retry,
   * rather than yanking them to the sign-in form. */
  window.showGate&&window.showGate();
  window.showAuthSignin&&window.showAuthSignin();
  try{showToast("Couldn't reach the server. Check your connection and retry.",5000)}catch(_){}
  if(typeof renderUserFooter==="function")renderUserFooter();
}

/* Run the boot. Wrapped in a .catch to keep the page responsive
   even if any boot step throws an unexpected error. */
authBoot().catch(function(){
  try{
    window.showGate&&window.showGate();
    window.showAuthSignin&&window.showAuthSignin();
  }catch(_){}
});
