/* P_storage-shim — first side-effect import, so the in-memory
   localStorage/sessionStorage shim is installed before the app modules
   below it (state/store.ts, i18n.ts, providers.js, displayPrefs.js, …)
   evaluate and touch storage. Without this ordering, first-party storage
   calls made during module evaluation can fire one
   "Tracking Prevention blocked access to storage" warning each
   before the shim's IIFE kicks in.

   The guarantee is RELATIVE, not absolute: `batchStorage.js` itself imports
   `ui/toast.js`, and ES modules evaluate a module's dependencies before the
   module, so anything reaching storage from inside that transitive graph runs
   before the shim is in place. What protects the ordering is the bundler
   honoring declaration order for side-effect-only imports — which is exactly
   what `e2e/storage-bootstrap.spec.mjs` pins (currently exactly one bundled
   storage read escapes the shim). Move this import, add one above it, or let
   a new early import reach storage and that spec fails. Treat the spec as the
   contract, not this comment. */
import './batchStorage.ts';
import './vendor/init.ts';
/* Auth boot owns the preflight → reveal sequence. */
import './auth/boot.ts';
/* Register page adapters before bootstrap publishes the active destination. */
import './sidebar/navigation.adapters.ts';
import './tutorSocratic.ts';
import './app/legacyBridge.ts';
import './app/errorGuard.ts';
import './render/katexRefresh.js';
import { initCookieConsent } from './cookieConsent.ts';
import { initChatComposerReserve } from './ui/scroll.ts';
import { initKeyboardLift } from './ui/keyboard/index.ts';
import { initTopicFocusAssist } from './ui/topicFocusAssist.ts';
import './ui/composerAnim.js';
import { installComposerShapeMirror } from './ui/composerShape.ts';
import { installKeyboardShortcuts } from './ui/keyboardShortcuts.ts';
import { initSidebarDrag } from './ui/sidebarResize.ts';
import { initSidebarChrome } from './ui/sidebarChrome.ts';
import { wireScrollPill } from './ui/scrollPill.ts';
import { wirePressFeedback } from './ui/pressFeedback.ts';
import { loadMemories } from './storage/memoryStore.ts';
import { initLinkFavicons } from './ui/linkFavicons.ts';
import { installLayoutStateMirror } from './ui/layoutStateMirror.ts';
import { installDiagnosticFlowActions } from './tutor/diagnosticFlow.ts';
import { isInAuthGraceWindow, handleAuthExpired, getUserMemories } from './app/lifecycle.ts';
import { installLiveTurnRetryListener } from './chat/liveTurn.ts';
import { configurePromptSuffixes } from './chat/promptSuffixes.ts';
import { initTheme, loadDisplayPrefs } from './displayPrefs.ts';
import { syncWebSearchUI } from './chat/webSearchToggle.ts';
import { bootstrapApp } from './app/bootstrap.ts';
import { installWidgetRuntime } from './app/widgetSetup.ts';
import { loadTonePreset } from './config/tonePresets.ts';
import { installAuthHooks } from './util/api.ts';
import { syncAppModeUI, syncSidebarForMode } from './config/providers.ts';
import { runtimeWindow as browserWindow } from "./types/runtimeWindow.ts";


initCookieConsent({ privacyUrl: 'https://topodrive.top/privacy' });
initLinkFavicons();

installLayoutStateMirror();

installComposerShapeMirror();

wireScrollPill();

wirePressFeedback();

initSidebarChrome();

initTheme();

loadDisplayPrefs();


initSidebarDrag();

installKeyboardShortcuts();

/* Share one keyboard session between responsive layout and the native bridge. */
const keyboardLift = initKeyboardLift({
  inputs: [
    document.getElementById('composerInputWrap'),
  ].filter((element): element is HTMLElement => element !== null),
  container: document.getElementById('appShell'),
});

browserWindow.__socratesKeyboard = keyboardLift;
initTopicFocusAssist();

(function initMsgScrollbar(){
  const ml=document.getElementById("msgList");
  if(!ml)return;
  let timer: number|null|undefined=null;
  let ticking=false;
  /* P_perf-scrollbar — scroll fires per frame while velocityScrollTo drives
     scrollTop (and per wheel tick while the reader scrolls). Coalesce the
     class write + timer reset to one rAF so rapid events share a single DOM
     touch; passive because the handler never cancels the scroll. */
  const raf=typeof requestAnimationFrame==="function"
    ?requestAnimationFrame
    :function(cb: TimerHandler){return setTimeout(cb,16)};
  ml.addEventListener("scroll",function(){
    if(ticking)return;
    ticking=true;
    raf(function(){
      ticking=false;
      if(!ml.classList.contains("scrollbar-visible"))ml.classList.add("scrollbar-visible");
      clearTimeout((timer ?? undefined));
      timer=setTimeout(function(){ml.classList.remove("scrollbar-visible")},1500);
    });
  },{passive:true});
})();
initChatComposerReserve();

installDiagnosticFlowActions();

installLiveTurnRetryListener();

installWidgetRuntime();

/* Install auth recovery before bootstrap can start API-backed work. */
installAuthHooks({ on401: handleAuthExpired, isInGraceWindow: isInAuthGraceWindow });

configurePromptSuffixes({ getUserMemories: getUserMemories });

/* Wire the extracted feature modules into the auth-aware app bootstrap. */
bootstrapApp({
  syncWebSearchUI: syncWebSearchUI,
  syncAppModeUI: syncAppModeUI,
  syncSidebarForMode: syncSidebarForMode,
  loadTonePreset: loadTonePreset,
  loadMemories: loadMemories,
});
