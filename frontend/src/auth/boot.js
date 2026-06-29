/* ── Auth boot sequence ──
   Runs once on page load. Handles:
   - URL params: oauth_error, error, share, token (verify), reset_token
   - /api/config probe (for built-in Beagle key)
   - /api/auth/me retry loop (3 attempts, 500ms backoff)
   - Branching to gate or app shell
   Reads main.js globals via window (BEAGLE_BUILT_IN, CURRENT_USER,
   apiFetch, fetchGeoInfo, etc.). */

import { apiFetch } from '../util/api.js';

/* Hoisted flag — `var` so it's available to refreshApiConfig()
   even if the boot IIFE completes before that function is defined. */
export var SERVER_HAS_BEAGLE_KEY=false;

export async function authBoot(){
  /* Prime the CSRF cookie before any API calls. */
  try{await fetch("/api/auth/csrf-token",{credentials:"include"})}catch(_){}
  /* Kick off geolocation fetch in background (cached for reuse). */
  try{window.fetchGeoInfo&&window.fetchGeoInfo()}catch(_){}

  var params=new URLSearchParams(location.search);
  var oauthError=params.get("oauth_error");
  if(oauthError){
    history.replaceState(null,"",location.pathname);
    window.showGate&&window.showGate();
    window.showAuthSignin&&window.showAuthSignin();
    var msg="GitHub login failed: "+decodeURIComponent(oauthError)+".";
    setTimeout(function(){try{window.showToast(msg,5000)}catch(_){}},500);
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
    try{window.loadSharedSession(shareToken)}catch(_){}
    return;
  }

  var token=params.get("token");
  var resetToken=params.get("reset_token");
  /* Verification link — consume token first. */
  if(token){
    history.replaceState(null,"",location.pathname+(params.get("redirect")?"?redirect="+encodeURIComponent(params.get("redirect")):""));
    window.showGate&&window.showGate();
    if(typeof window.submitAuthVerify==="function")await window.submitAuthVerify(token);
    return;
  }
  /* Password reset link — show the reset form immediately. */
  if(resetToken){
    history.replaceState(null,"",location.pathname);
    window.showGate&&window.showGate();
    window.__resetToken=resetToken;
    window.showAuthView&&window.showAuthView("authResetPasswordView");
    document.querySelectorAll(".auth-tab").forEach(function(t){t.classList.remove("active")});
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
  /* Fetch the built-in Beagle API key from the server's public config
     endpoint so the key lives in the server environment, not the source. */
  var cfgOk=false;
  try{
    var cfg=await fetch("/api/config",{credentials:"include"}).then(function(r){return r.json()}).catch(function(){return{}});
    if(cfg&&cfg.hasBeagleKey){
      /* The server proxies Beagle requests using its own env key.
         The raw key is never sent to the client, so cfg.beagleKey
         is intentionally absent. Only update model when the server
         explicitly provides one. */
      var BEAGLE_BUILT_IN=window.BEAGLE_BUILT_IN;
      if(BEAGLE_BUILT_IN){
        if(typeof cfg.beagleKey==="string")BEAGLE_BUILT_IN.key=cfg.beagleKey;
        if(typeof cfg.beagleModel==="string")BEAGLE_BUILT_IN.model=cfg.beagleModel;
      }
      cfgOk=true;
    }
  }catch(_){console.warn("[boot] config fetch failed")}
  /* Promote to the module-level flag so refreshApiConfig() — which
     runs after we return — can decide whether to fall back to
     BEAGLE on cold start. */
  SERVER_HAS_BEAGLE_KEY=cfgOk;
  console.log("[boot] config hasBeagleKey="+cfgOk+", BEAGLE_BUILT_IN.key.length="+((window.BEAGLE_BUILT_IN&&window.BEAGLE_BUILT_IN.key)||"").length);

  /* P0.0 — only route the user to the auth gate when the server
   * explicitly says 401. Network blips, 5xx, and a missing
   * `/api/auth/me` response must NOT silently log the user out, or
   * a transient hiccup on a refresh will force them back through
   * the sign-in flow. We retry once after 500ms on transient
   * failures, then show a "couldn't reach the server" toast and
   * stop on the topic-setup shell so the user can try again. */
  var me=null;
  var meLastErr=null;
  for(var meAttempt=1;meAttempt<=3;meAttempt++){
    try{
      me=await apiFetch("/api/auth/me",{_authEndpoint:true});
      break;
    }catch(e){
      meLastErr=e;
      console.warn("[boot] /me attempt "+meAttempt+" failed:",e&&e.message,e&&e.status);
      if(e&&e.status===401){
        /* Genuine session expiry. Don't immediately kick to the gate on the
         * very first 401 — a transient race or a Set-Cookie propagation
         * delay can produce a 401 even when the session is still valid.
         * Retry once more after a short delay before declaring the user
         * logged out, so a single bad response doesn't force a re-login. */
        if(meAttempt<3){
          await new Promise(function(r){setTimeout(r,500)});
          continue;
        }
        window.showGate&&window.showGate();
        window.showAuthSignin&&window.showAuthSignin();
        return;
      }
      if(meAttempt<3)await new Promise(function(r){setTimeout(r,500)});
    }
  }
  if(me&&me.user){
    if(typeof window.setCurrentUser==="function")window.setCurrentUser(me.user);
    else window.CURRENT_USER=me.user;
    console.log("[boot] /me succeeded: user="+(me.user&&me.user.email)+
      " verifiedAt="+(me.user&&me.user.verifiedAt)+
      " plan="+(me.user&&me.user.plan));
    /* Grace window for the Set-Cookie to settle (see notes in
     * markAuthSuccess). */
    try{window.markAuthSuccess&&window.markAuthSuccess()}catch(_){}
    if(typeof window.afterAuthEnter==="function")await window.afterAuthEnter();
    window.hideGate&&window.hideGate();
    return;
  }
  /* /me never resolved with a user — surface a visible error and
   * leave the user on the existing app shell so they can retry,
   * rather than yanking them to the sign-in form. */
  console.warn("[boot] /me unresolved after retries:",meLastErr&&meLastErr.message);
  window.showGate&&window.showGate();
  window.showAuthSignin&&window.showAuthSignin();
  try{window.showToast("Couldn't reach the server. Check your connection and retry.",5000)}catch(_){}
  if(typeof window.renderUserFooter==="function")window.renderUserFooter();
}

/* Run the boot. Wrapped in a .catch to keep the page responsive
   even if any boot step throws an unexpected error. */
authBoot().catch(function(e){
  console.error("[boot] unhandled error:",e&&e.message);
  try{
    window.showGate&&window.showGate();
    window.showAuthSignin&&window.showAuthSignin();
  }catch(_){}
});
