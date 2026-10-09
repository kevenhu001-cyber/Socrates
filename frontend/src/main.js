/* P_storage-shim — first side-effect import, so the in-memory
   localStorage/sessionStorage shim is installed before the app modules
   below it (state/store.js, i18n.js, providers.js, displayPrefs.js, …)
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
import './batchStorage.js';
import './vendor/init.js';
/* Static import keeps legacy window bridges in the application bundle. */
import './windowExports.js';
import './tutorSocratic.js';
import './app/legacyBridge.js';
import './app/errorGuard.js';
import './render/katexRefresh.js';
import './i18n.js';
import { initCookieConsent } from './cookieConsent.js';
import { installHomeSurface } from './ui/homeSurface.js';
import { toggleComposerTools } from './ui/composerTools.js';
import { toggleEffortPicker } from './ui/effortPicker.js';
import { selectAppMode, toggleMobileModeMenu } from './ui/mobileModeSwitch.js';
import { openFindInSession } from './ui/findInSession.js';
import { initChatComposerReserve } from './ui/scroll.js';
import { initKeyboardLift } from './ui/keyboard/index.ts';
import { initTopicFocusAssist } from './ui/topicFocusAssist.js';
import './ui/composerAnim.js';
import { installComposerShapeMirror } from './ui/composerShape.js';
import { installKeyboardShortcuts } from './ui/keyboardShortcuts.js';
import { isNativeApp, setupNativeBridge } from './native/capacitorBridge.js';
import { initSidebarDrag } from './ui/sidebarResize.js';
import { switchTab, toggleSidebarView, initSidebarChrome } from './ui/sidebarChrome.js';
import { wireScrollPill } from './ui/scrollPill.js';
import { wirePressFeedback } from './ui/pressFeedback.js';
import { openShareModal } from './ui/share.js';
import { loadMemories } from './storage/memoryStore.js';
import { initArtifactPreview } from './ui/artifactPreview.js';
import { initLinkFavicons } from './ui/linkFavicons.js';
import { installLayoutStateMirror } from './ui/layoutStateMirror.js';
import { installDiagnosticFlowListeners } from './tutor/diagnosticFlow.js';
import { startSession } from './chat/sessionBootstrap.js';
import { startNewChat, toggleIncognito, isInAuthGraceWindow, handleAuthExpired, getUserMemories } from './app/lifecycle.js';
import { setRecentsSearch } from './ui/recentsView.js';
import { installLiveTurnRetryListener } from './chat/liveTurn.js';
import {
  configurePromptSuffixes,
} from './chat/promptSuffixes.ts';
import { toggleSidebar } from './sidebar/sidebar.service.ts';
import { initTheme, loadDisplayPrefs, mountDisplayPrefsListeners } from './displayPrefs.js';
import { syncExtensionsUI, syncModelPills, syncWebSearchUI } from './pickers.js';
import { bootstrapApp } from './app/bootstrap.js';
import { installWidgetRuntime } from './app/widgetSetup.js';
import { loadTonePreset } from './config/tonePresets.js';
import { installAuthHooks } from './util/api.js';
import {
  syncAppModeUI, syncSidebarForMode,
} from './config/providers.js';

window.__SOCRATES_RELEASE_TAG__ = '20261008-speed-opt';

initCookieConsent({ privacyUrl: 'https://topodrive.top/privacy' });
installHomeSurface();
initArtifactPreview();
initLinkFavicons();

installLayoutStateMirror();

installComposerShapeMirror();

wireScrollPill();

wirePressFeedback();

initSidebarChrome();

initTheme();

loadDisplayPrefs();

mountDisplayPrefsListeners();

initSidebarDrag();

installKeyboardShortcuts();

/* Share one keyboard session between responsive layout and the native bridge. */
const keyboardLift = initKeyboardLift({
  inputs: [
    document.getElementById('composerInputWrap'),
  ].filter(Boolean),
  container: document.getElementById('appShell'),
});

window.__socratesKeyboard = keyboardLift;
initTopicFocusAssist();

if (isNativeApp()) {
  setupNativeBridge({ keyboard: keyboardLift });
}

(function initMsgScrollbar(){
  var ml=document.getElementById("msgList");
  if(!ml)return;
  var timer=null;
  ml.addEventListener("scroll",function(){
    ml.classList.add("scrollbar-visible");
    clearTimeout(timer);
    timer=setTimeout(function(){ml.classList.remove("scrollbar-visible")},1500);
  });
})();
initChatComposerReserve();

installDiagnosticFlowListeners();

installLiveTurnRetryListener();

installWidgetRuntime();

/* Install auth recovery before bootstrap can start API-backed work. */
installAuthHooks({ on401: handleAuthExpired, isInGraceWindow: isInAuthGraceWindow });

configurePromptSuffixes({ getUserMemories: getUserMemories });

/* Legacy session persistence reads this flag before a user toggles it. */
try{window.incognitoOn=false;}catch(_){}

/* Wire the extracted feature modules into the auth-aware app bootstrap. */
bootstrapApp({
  syncModelPills: syncModelPills,
  syncWebSearchUI: syncWebSearchUI,
  syncExtensionsUI: syncExtensionsUI,
  syncAppModeUI: syncAppModeUI,
  syncSidebarForMode: syncSidebarForMode,
  loadTonePreset: loadTonePreset,
  loadMemories: loadMemories,
  toggleSidebar: toggleSidebar,
  startNewChat: startNewChat,
  toggleIncognito: toggleIncognito,
  openFind: openFindInSession,
  openSummary: function(){
    var bridge=window.__socratesThinkingPanelBridge;
    if(!bridge||typeof bridge.publish!=="function")return;
    var open=typeof bridge.getSnapshot==="function"&&bridge.getSnapshot().open;
    bridge.publish({type:open?"panel-close":"panel-open",messageId:null});
  },
  openShare: openShareModal,
  openSettings: window.openSettings,
  startSession: startSession,
  sendMessage: window.handleSendClick,
  toggleComposerTools: toggleComposerTools,
  toggleEffort: toggleEffortPicker,
  selectMode: selectAppMode,
  toggleMobileMode: toggleMobileModeMenu,
  searchRecents: setRecentsSearch,
  switchTab: switchTab,
  toggleSidebarView: toggleSidebarView,
});
