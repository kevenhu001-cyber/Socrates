/* ── Auth boot sequence ──
   Runs once on page load. Handles:
   - URL params: oauth_error, error, share, token (verify), reset_token
   - /api/config probe (for built-in Beagle key)
   - /api/auth/me retry loop (3 attempts, 500ms backoff)
   - Branching to gate or app shell
   Reads auth/session bootstrap values via window (CURRENT_USER,
   SERVER_HAS_BEAGLE_KEY, apiFetch, etc.). */

import { apiFetch, makeApiError } from '../util/api.js';
import { setBuiltInProviderModel } from '../config/providerConfig.service.ts';
import { showToast } from '../ui/toast.js';
import { openMobileTargetFromUrl } from '../native/mobileWebSessionBridge.js';

import { loadSharedSession } from '../ui/share.js';
import { reportSwallow } from '../util/reportSwallow.ts';

import { showAuthView, submitAuthVerify, revealAppAndHydrate } from './index.js';

import { renderUserFooter } from '../ui/profile.js';

/* P_perf-i18n-split — give the lazily-loaded zh locale chunk a bounded
   head start before any UI becomes visible. zh is the default locale and
   its chunk normally lands long before /api/auth/me resolves, so this is
   a no-op in practice; the 500 ms cap only bounds the worst case. */
function i18nSettled(){
  try{
    var p=window.__i18nReady;
    return p?Promise.race([p,new Promise(function(r){setTimeout(r,500)})]):Promise.resolve();
  }catch(_){return Promise.resolve();}
}

/* Hoisted flag — `var` so it's available to refreshApiConfig()
   even if the boot IIFE completes before that function is defined. */
export var SERVER_HAS_BEAGLE_KEY=false;

export async function authBoot(){
  /* P_perf-boot-prefetch — index.html fires me/config/csrf while the
     parser is still in <head>, so by the time 200+ modules evaluate the
     responses are usually already here. Prefer those promises; a missing
     or failed preflight (older cached HTML, CSP-blocked inline script,
     network error shape) falls back to the exact calls below, so the
     boot behaves identically with or without the head start. */
  var preflight=null;
  try{ preflight=window.__bootApi||null; }catch(_){ preflight=null; }
  /* Prime the CSRF cookie before any API calls. */
  var csrfReady=(preflight&&preflight.csrf)
    || fetch("/api/v2/auth/csrf-token",{credentials:"include"}).catch(function(){});
  /* Shape the raw preflight result into the apiFetch contract (parsed
     JSON on success; a thrown status-carrying error otherwise) so the
     single wrapper below and the retry loop treat both sources exactly
     alike. Uses the same error taxonomy as util/api.js. */
  function adoptPreflight(p,label){
    return Promise.resolve(p).then(function(r){
      if(!r||r.failed)throw makeApiError(0,"网络异常，请检查连接后重试",null,"NETWORK",0);
      if(r.status===401)throw makeApiError(401,"Unauthorized",null,"UNAUTHORIZED",0);
      if(r.status<200||r.status>=300)throw makeApiError(r.status,"request failed: "+label,null,"HTTP_"+r.status,0);
      return r.json;
    });
  }
  var params=new URLSearchParams(location.search);
  /* P_local-dev-bypass — when the app is served from localhost (vite dev
   * server, `npm run dev`) append `?dev=1` to skip the sign-in flow.
   * The hostname guard means this branch is unreachable on any deployed
   * host, so the bypass cannot be exercised in production. */
  if(params.get("dev")==="1"&&/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)){
    await csrfReady;
    history.replaceState(null,"",location.pathname+(params.get("next")?"?next="+encodeURIComponent(params.get("next")):""));
    try{
      setBuiltInProviderModel("local");
      window.SERVER_HAS_BEAGLE_KEY=true;
    }catch(e){reportSwallow(e, 'auth/boot.adoptPreflight.localConfig');}
    var devUser={id:"local-dev",name:"Local Dev",email:"dev@local",plan:"local",isLocal:true};
    if(typeof window.setCurrentUser==="function")window.setCurrentUser(devUser);
    else window.CURRENT_USER=devUser;
    try{window.markAuthSuccess&&window.markAuthSuccess()}catch(e){reportSwallow(e, 'auth/boot.adoptPreflight.markAuthSuccess'); }
    revealAppAndHydrate();
    return;
  }
  var oauthError=params.get("oauth_error");
  if(oauthError){
    history.replaceState(null,"",location.pathname);
    window.showGate&&window.showGate();
    window.showAuthSignin&&window.showAuthSignin();
    var msg="GitHub login failed: "+decodeURIComponent(oauthError)+".";
    setTimeout(function(){try{showToast(msg,5000)}catch(e){reportSwallow(e, 'auth/boot.adoptPreflight.toast');}},500);
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
    }catch(e){reportSwallow(e, 'auth/boot.adoptPreflight.shareSession'); }
    return;
  }

  var token=params.get("token");
  var resetToken=params.get("reset_token");
  /* Verification link — consume token first. */
  if(token){
    await csrfReady;
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
      }catch(e){ reportSwallow(e, 'auth/boot.adoptPreflight.prefillResetEmail'); /* leave empty; form still works */ }
    })();
    return;
  }
  /* Fetch the built-in Beagle API key from the server's public config
     endpoint so the key lives in the server environment, not the source. */
  var meRequest=(preflight&&preflight.me)
    ? adoptPreflight(preflight.me,"/api/auth/me")
    : apiFetch("/api/auth/me",{_authEndpoint:true});
  meRequest=meRequest.then(function(value){return {value:value}},function(error){return {error:error}});
  var configRequest=(preflight&&preflight.config)
    ? Promise.resolve(preflight.config).then(function(r){ return (r&&!r.failed&&r.json)?r.json:{}; })
    : fetch("/api/v2/config",{credentials:"include"}).then(function(response){return response.json()}).catch(function(){return {}});
  var initialMe=await meRequest;
  if(initialMe.error&&initialMe.error.status===401&&!window.isInAuthGraceWindow?.()){
    await i18nSettled();
    window.showGate&&window.showGate();
    window.showAuthSignin&&window.showAuthSignin();
    return;
  }
  var cfgOk=false;
  try{
    var cfg=await configRequest;
    if(cfg&&cfg.hasBeagleKey){
      /* The server proxies Beagle requests using its own env key.
         The raw key is never sent to the client, so cfg.beagleKey
         is intentionally absent. Only update model when the server
         explicitly provides one. */
      if(typeof cfg.beagleModel==="string")setBuiltInProviderModel(cfg.beagleModel);
      cfgOk=true;
    }
    /* P_privacy-leak — bridge the server-side capability hint to
     * window so isReasoningProvider() can request reasoning_effort for
     * the built-in provider without ever knowing its model name.
     * Default false (assume non-reasoning) if the server is older and
     * doesn't send the field. */
    try { window.BEAGLE_IS_REASONING = cfg && cfg.isReasoning === true; } catch (e) { reportSwallow(e, 'auth/boot.configRequest.setReasoningFlag'); }
  }catch(e){reportSwallow(e, 'auth/boot.configRequest.fetchConfig'); /* config fetch failed */ }
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
  try { window.SERVER_HAS_BEAGLE_KEY = cfgOk; } catch (e) { reportSwallow(e, 'auth/boot.configRequest.rebridgeServerHasKey'); }

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
      if(meAttempt===1){
        if(initialMe.error)throw initialMe.error;
        me=initialMe.value;
      }else me=await apiFetch("/api/auth/me",{_authEndpoint:true});
      break;
    }catch(e){
      if(e&&e.status===401){
        if(meAttempt<3&&window.isInAuthGraceWindow?.()){
          await new Promise(function(r){setTimeout(r,500)});
          continue;
        }
        await i18nSettled();
        window.showGate&&window.showGate();
        window.showAuthSignin&&window.showAuthSignin();
        return;
      }
      if(meAttempt<3)await new Promise(function(r){setTimeout(r,500)});
    }
  }
  if(me&&me.user){
    await Promise.all([csrfReady,i18nSettled()]);
    if(typeof window.setCurrentUser==="function")window.setCurrentUser(me.user);
    else window.CURRENT_USER=me.user;
    /* Grace window for the Set-Cookie to settle (see notes in
     * markAuthSuccess). */
    try{window.markAuthSuccess&&window.markAuthSuccess()}catch(e){reportSwallow(e, 'auth/boot.configRequest.markAuthSuccess'); }
    /* The one-time mobile web-session consume route leaves an allow-listed
       target in the query. Open it only after normal authenticated hydration
       so its list data and controls match a first-party browser visit. */
    revealAppAndHydrate(openMobileTargetFromUrl);
    return;
  }
  /* /me never resolved with a user — surface a visible error and
   * leave the user on the existing app shell so they can retry,
   * rather than yanking them to the sign-in form. */
  await i18nSettled();
  window.showGate&&window.showGate();
  window.showAuthSignin&&window.showAuthSignin();
  try{showToast("Couldn't reach the server. Check your connection and retry.",5000)}catch(e){reportSwallow(e, 'auth/boot.configRequest.offlineToast'); }
  if(typeof renderUserFooter==="function")renderUserFooter();
}

/* Run the boot. Wrapped in a .catch to keep the page responsive
   even if any boot step throws an unexpected error. */
authBoot().catch(function(){
  try{
    window.showGate&&window.showGate();
    window.showAuthSignin&&window.showAuthSignin();
  }catch(e){reportSwallow(e, 'auth/boot.configRequest.fallbackGate');}
});
