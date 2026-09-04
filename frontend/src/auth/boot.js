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

export async function authBoot(){
  /* Prime the CSRF cookie before any API calls. */
  try{await fetch("/api/v2/auth/csrf-token",{credentials:"include"})}catch(_){}
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
    if(typeof afterAuthEnter==="function")try{await afterAuthEnter()}catch(_){}
    window.hideGate&&window.hideGate();
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
  /* Fetch the built-in Beagle API key from the server's public config
     endpoint so the key lives in the server environment, not the source. */
  var cfgOk=false;
  try{
    var cfg=await fetch("/api/v2/config",{credentials:"include"}).then(function(r){return r.json()}).catch(function(){return{}});
    if(cfg&&cfg.hasBeagleKey){
      /* The server proxies Beagle requests using its own env key.
         The raw key is never sent to the client, so cfg.beagleKey
         is intentionally absent. Only update model when the server
         explicitly provides one. */
      var BEAGLE_BUILT_IN = window.BEAGLE_BUILT_IN;
      if(BEAGLE_BUILT_IN){
        if(typeof cfg.beagleKey==="string")BEAGLE_BUILT_IN.key=cfg.beagleKey;
        if(typeof cfg.beagleModel==="string")BEAGLE_BUILT_IN.model=cfg.beagleModel;
      }
      cfgOk=true;
    }
    /* P_privacy-leak — bridge the server-side capability hint to
     * window so isReasoningProvider() / pickStreamBudgets() can pick
     * longer timeouts and request reasoning_effort for the built-in
     * provider without ever knowing its model name. Default false
     * (assume non-reasoning) if the server is older and doesn't send
     * the field. */
    try { window.BEAGLE_IS_REASONING = cfg && cfg.isReasoning === true; } catch (_) {}
  }catch(_){/* config fetch failed */}
  /* Promote to the module-level flag so refreshApiConfig() — which
     runs after we return — can decide whether to fall back to
     BEAGLE on cold start. */
  SERVER_HAS_BEAGLE_KEY=cfgOk;
  /* Also sync the window bridge. windowExports.js imported the var
     at module-load time (false), and ESM imports are live bindings
     for re-exports BUT the plain assignment `window.X = X` in
     windowExports.js captured the value at import time, so the
     window copy never sees the runtime update above. Re-bridge
     here so refreshApiConfig() sees the true value. */
  try { window.SERVER_HAS_BEAGLE_KEY = cfgOk; } catch (_) {}

  /* P0.0 — only route the user to the auth gate when the server
   * explicitly says 401. Network blips, 5xx, and a missing
   * `/api/auth/me` response must NOT silently log the user out, or
   * a transient hiccup on a refresh will force them back through
   * the sign-in flow. We retry once after 500ms on transient
   * failures, then show a "couldn't reach the server" toast and
   * stop on the topic-setup shell so the user can try again. */
  var me=null;
  for(var meAttempt=1;meAttempt<=3;meAttempt++){
    try{
      me=await apiFetch("/api/auth/me",{_authEndpoint:true});
      break;
    }catch(e){
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
    /* Grace window for the Set-Cookie to settle (see notes in
     * markAuthSuccess). */
    try{window.markAuthSuccess&&window.markAuthSuccess()}catch(_){}
    if(typeof afterAuthEnter==="function")await afterAuthEnter();
    window.hideGate&&window.hideGate();
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
