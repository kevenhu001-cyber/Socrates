// @ts-check
// src/windowExports.ts — Phase B central bridge
// Single source of truth for inline-handler-visible window.X bindings.
// All `onclick="X()"` / `onkeydown="X()"` in index.html and in
// dynamic innerHTML strings resolve via [[Resolve]] → window.X →
// this file's side-effects.
//
// Why side-effect import from main.js: Vite/esbuild's iife
// tree-shaking removes any `export` not statically referenced. We
// don't want a 150-line named import in main.js, so we use
// `import './windowExports.ts'` to force the bundle to keep this
// module (and run all its `window.X = X` statements).
//
// Migration status:
//   main.js is now the startup composition root. Feature modules own the
//   implementations; this file and app/legacyBridge.ts retain compatibility
//   aliases for inline markup and callers that have not migrated yet.
//   Prefer direct module imports or typed bridges for new callers.

/* ─── auth/boot.js — boot-time flags ─── */
import { SERVER_HAS_BEAGLE_KEY } from './auth/boot.ts';
browserWindow.SERVER_HAS_BEAGLE_KEY = SERVER_HAS_BEAGLE_KEY;

/* ─── config/providers.js ─── */
import { appMode, webSearchOn, extensiveThinkingOn, syncAppModeUI, setAppMode, thinkingOn } from './config/providers.ts';
browserWindow.appMode = appMode;
browserWindow.webSearchOn = webSearchOn;
browserWindow.extensiveThinkingOn = extensiveThinkingOn;
browserWindow.syncAppModeUI = syncAppModeUI;
browserWindow.setAppMode = setAppMode;
browserWindow.thinkingOn = thinkingOn;

/* ─── displayPrefs.js ─── */
/* Only toggleTheme stays on window (inline onclick in the prefs modal);
   every other displayPrefs consumer imports the module directly. */
import { toggleTheme } from './displayPrefs.ts';
browserWindow.toggleTheme = toggleTheme;

/* ─── util/api.ts ─── */
import { apiFetch, getCsrfToken } from './util/api.ts';
browserWindow.apiFetch = apiFetch;
browserWindow.getCsrfToken = getCsrfToken;

/* ─── render/viz.ts ─── */
import { processPendingVizActions, getLiveVizCardIds } from './render/vizStubs.ts';
/* mountVisualization / disposeVisualizations are imported directly by
   their consumers (main.js, share.js); no window surface is needed. */
import './render/vizStubs.ts';
browserWindow.processPendingVizActions = processPendingVizActions;
/* E2E test surface: viz-canvas.spec.mjs asserts the iframe registry
   releases the entry after `viz-ready` fires. Expose a snapshot
   helper so the test can do `getLiveVizCardIds()` instead of
   poking the live map directly. */
browserWindow.getLiveVizCardIds = getLiveVizCardIds;

/* ─── ui/searchProgress.ts — E2E test surface: search-progress.spec.mjs
   exercises the search-activity UI via window.__startSearchProgress. ─── */
import { startSearchProgress } from './ui/searchProgress.ts';
browserWindow.__startSearchProgress = startSearchProgress;

/* ─── render/markdown.js ─── */
import { formatMsg } from './render/markdown.ts';
browserWindow.formatMsg = formatMsg;

/* ─── auth/index.js ─── */
/* Only the gate entry points stay on window (index.html inline
   onclick). Every auth view/submit handler is invoked through
   auth/index.js's own module-local wiring. */
import { hideGate, showGate, showAuthSignin } from './auth/index.ts';
browserWindow.hideGate = hideGate;
browserWindow.showGate = showGate;
browserWindow.showAuthSignin = showAuthSignin;

/* ─── typed sidebar service ─── */
import { toggleSidebar } from './sidebar/sidebar.service.ts';
browserWindow.toggleSidebar = toggleSidebar;

/* ─── pickers.js ─── */
/* Extension toggles / picker menus are wired module-locally; only the
   four model-pill entry points below stay on window (inline onclick in
   index.html + the composer pills). */
import { getActiveProvider, syncModelPills, syncChatModel, toggleWebSearch } from './pickers.ts';
browserWindow.getActiveProvider = getActiveProvider;
browserWindow.syncModelPills = syncModelPills;
browserWindow.syncChatModel = syncChatModel;
browserWindow.toggleWebSearch = toggleWebSearch;
// Settings loads its React surface lazily through the typed service below.

/* ─── ui/cheatsheet.js ─── */
import { closeCheatsheet, openCheatsheet } from './ui/cheatsheet.js';
/* PR-A — openCheatsheet is referenced inline by the More popover
   (More → Keyboard shortcuts) and was previously only reachable
   through the main.js keydown handler. Re-bridge it here so
   inline-handlers.spec.mjs sees a window.openCheatsheet binding. */
browserWindow.openCheatsheet = openCheatsheet;
/* The cheatsheet modal markup carries inline onclick="closeCheatsheet()"
   — inline handlers resolve from window, so this binding must stay. */
browserWindow.closeCheatsheet = closeCheatsheet;

/* ─── sidebar/nav.ts (PR-A of the sidebar overhaul) ─── */
import { openNav, setActiveNav } from './sidebar/navigation.service.ts';
/* `openNav` drives navigation from the imperative callers below — the
   React sidebar (react/sidebar/SidebarNav.tsx), the more-popover, the
   keyboard shortcuts, the home surface and the native bridge. index.html
   renders the nav rows as a pre-hydration placeholder with no inline
   handlers, so nothing here is required by the static markup.
   `setActiveNav` is exposed for the morePopover module to clear the More
   button's active state on close (avoids a nav.js ↔ morePopover.js import
   cycle). */
browserWindow.openNav = openNav;
browserWindow.setActiveNav = setActiveNav;
/* Destination adapters load the existing pages and register them with the
   typed navigation service. The React sidebar talks to that service directly. */
import './sidebar/navigation.adapters.ts';

/* ─── sidebar/morePopover.ts (PR-A) ─── */
import { closeMorePopover } from './sidebar/morePopover.ts';
browserWindow.closeMorePopover = closeMorePopover;

/* ─── ui/confirm.js ─── */
import { closeConfirm, showConfirm } from './ui/confirm.js';
browserWindow.closeConfirm = closeConfirm;
browserWindow.showConfirm = showConfirm;

/* ─── ui/cmdK.ts ─── */
import { closeCmdK, onCmdKInput, onCmdKKey, openCmdK } from './ui/cmdK.ts';
browserWindow.closeCmdK = closeCmdK;
browserWindow.onCmdKInput = onCmdKInput;
browserWindow.onCmdKKey = onCmdKKey;
browserWindow.openCmdK = openCmdK;

/* ─── ui/findInSession.js — P0.2 in-session find (Ctrl-F) ─── */
import { openFindInSession, closeFindInSession, findNext, findPrev } from './react/find-in-session/findInSession.actions.ts';
browserWindow.openFindInSession = openFindInSession;
browserWindow.closeFindInSession = closeFindInSession;
browserWindow.findNext = findNext;
browserWindow.findPrev = findPrev;

/* ─── ui/storage.js ─── */
/* Consumers (React panels) import the storage modal
   directly; the bare import only keeps evaluation order. */
import './ui/storage.js';

/* ─── ui/promptTemplates.ts ─── */
/* The modal's inline onclick handlers are wired inside
   ui/promptTemplates.ts itself; main.js imports the module directly.
   Bare import keeps evaluation order. */
import './ui/promptTemplates.ts';

/* ─── ui/composerTools.ts ─── */
import { toggleComposerTools } from './ui/composerTools.ts';
browserWindow.toggleComposerTools = toggleComposerTools;


/* ─── ui/voiceInput.ts ───
   Lazy (~16KB): the mic button only loads the speech module when
   pressed. stopSpeechInput skips the import when speech was never
   started (module can't be mid-session if it never loaded). */
let _voiceImport: Promise<typeof import('./ui/voiceInput.ts')>|null = null;
function _loadVoiceInput() {
  if (!_voiceImport) {
    _voiceImport = import('./ui/voiceInput.ts');
    _voiceImport.catch(function (err) {
      _voiceImport = null;
      console.error('[voice] failed to load', err);
    });
  }
  return _voiceImport;
}
browserWindow.toggleSpeechInput = function (surface: string) { return _loadVoiceInput().then(function (m) { return m.toggleSpeechInput(surface); }); };
browserWindow.stopSpeechInput = function () { if (_voiceImport) return _voiceImport.then(function (m) { return m.stopSpeechInput(); }); };
/* ─── Settings React surface ───
   Lazy: Settings and its provider domain load only when opened. */
let _settingsImport: Promise<typeof import('./react/settings/settings.service.ts')>|null = null;
function _loadSettingsModule() {
  if (!_settingsImport) {
    _settingsImport = import('./react/settings/settings.service.ts');
    _settingsImport.catch(function (err) {
      _settingsImport = null;
      console.error('[settings] failed to load', err);
    });
  }
  return _settingsImport;
}
browserWindow.openSettings = function () { return _loadSettingsModule().then(function (m) { return m.openSettings(); }); };
browserWindow.closeSettings = function () { if (_settingsImport) return _settingsImport.then(function (m) { return m.closeSettings(); }); };

/* ─── ui/share.ts ─── */
/* Copy/load handlers are wired module-locally inside ui/share.ts and by
   main.js's direct imports; only the topbar/entry points below stay on
   window. */
import { openShareModal, closeShareModal, revokeShareLink, createShareLink } from './ui/share.ts';
import { toggleChatTopBarEls } from './ui/topBarState.ts';
browserWindow.toggleChatTopBarEls = toggleChatTopBarEls;
browserWindow.openShareModal = openShareModal;
browserWindow.closeShareModal = closeShareModal;
browserWindow.revokeShareLink = revokeShareLink;
browserWindow.createShareLink = createShareLink;

/* ─── ui/dangerConfirms.js ─── */
/* The three confirm actions are reached only through
   __socratesLegacy.profile.*, which legacyBridge.js lazy-proxies — the
   module stays out of the entry graph entirely. */

/* ─── ui/profile.ts ─── */
/* Profile handlers are wired module-locally; only the two inline-handler
   entry points below stay on window. */
import { closeProfile, openProfile } from './ui/profile.ts';
browserWindow.closeProfile = closeProfile;
browserWindow.openProfile = openProfile;

/* ─── ui/scroll.ts ─── */

/* ─── ui/topicSetup.ts ─── */
/* Composer auto-resize is consumed via main.js's direct imports; bare
   import keeps evaluation order. */
import './ui/topicSetup.ts';

/* ─── storage/localMemory.js ─── */

/* ─── storage/memoryStore.js — cross-session memory ─── */
/* Consumers (main.js, profile panel) import the memory layer directly;
   bare import keeps evaluation order. */
import './storage/memoryStore.js';

/* ─── config/tonePresets.js — AI tone/voice presets ─── */
/* React SettingsModal imports the state module directly. This bare import
   keeps its initialization order. */
import './config/tonePresets.js';

/* ─── agent/researchAgent.ts — Deep Research / Agent Mode ───
   Lazy (~18KB): the deep-research entry is a quick-action click, so the
   module loads on first use rather than at boot. */
let _researchImport: Promise<typeof import('./agent/researchAgent.ts')>|null = null;
function _loadResearchAgent() {
  if (!_researchImport) {
    _researchImport = import('./agent/researchAgent.ts');
    _researchImport.catch(function (err) {
      _researchImport = null;
      console.error('[research] failed to load', err);
    });
  }
  return _researchImport;
}
browserWindow.startDeepResearch = function (query: string) { return _loadResearchAgent().then(function (m) { return m.startDeepResearch(query); }); };
browserWindow.launchDeepResearch = function () { return _loadResearchAgent().then(function (m) { return m.launchDeepResearch(); }); };

/* ─── attachments.js ─── */
// attachments is a mutable array reference shared across modules
// (chat/stream.js / render helpers / submitChatMessage all read it
// via window.attachments). The bridge must preserve identity — never
// replace it with a copy.
import { attachments, removeAttachment } from './attachments.ts';
browserWindow.attachments = attachments;
browserWindow.removeAttachment = removeAttachment;

/* ─── attachments/render.ts — renderAttachmentChips is consumed by
   React's legacyAdapter and by main.js for the attachment chip strip.
   It was exported but never bridged to window, causing
   window.__socratesLegacy.composer.renderAttachmentChips to be undefined. */
import { renderAttachmentChips, retryComposerAttachment } from './attachments/render.ts';
browserWindow.renderAttachmentChips = renderAttachmentChips;
/* Error-chip retry entry point for the React chip row
   (composer.retryAttachment in the legacy gateway). */
browserWindow.retryComposerAttachment = retryComposerAttachment;

/* ─── ui/topicSetup.ts — send/start button refreshers. attachments/
   render.js calls them by name (window[w.updateBtnName]) after every
   file add/remove so an attachment-only draft still lights up Send, and
   extensions/modules/write.ts reaches them through window as well. */
import { updateComposerBtn } from './ui/topicSetup.ts';
browserWindow.updateComposerBtn = updateComposerBtn;

/* ─── i18n.ts (setLang) ─── */
// i18n.ts does not have ESM named exports — setLang is bound on
// `window.setLang` directly inside i18n.ts (line 931) after the
// function is declared at module scope. We do a side-effect import
// to make sure i18n.ts is evaluated first, then re-bind from window
// so this file remains the single bridge audit point.
import './i18n.ts';
if (typeof browserWindow.setLang === 'function') {
  // Re-affirm in this bridge file (no-op if already set).
} else {
  // Defensive fallback if i18n.ts refactor changes the binding point.
  browserWindow.setLang = function () { /* noop */ };
}

// Note: refreshApiConfig / handleRefreshProductInfo are still defined
// inside main.js. They will be migrated to a dedicated module in a
// later Phase C sub-step. For now main.js keeps them on window itself.

/* ─── chat/offline.js ─── */
import { STREAM_MAX_ATTEMPTS, STREAM_RETRYABLE_STATUS, offlineGuard, sleepBackoff } from './chat/offline.ts';
browserWindow.STREAM_MAX_ATTEMPTS = STREAM_MAX_ATTEMPTS;
browserWindow.STREAM_RETRYABLE_STATUS = STREAM_RETRYABLE_STATUS;
browserWindow.offlineGuard = offlineGuard;
browserWindow.sleepBackoff = sleepBackoff;

/* ─── ui/usage.ts ───
   Lazy (~11KB): the usage overlay only loads on first open. The module's
   own listeners mount inside the lazy loader (previously done eagerly
   by app/bootstrap.ts).
   Period tab and heatmap interactions are delegated listeners installed
   by the lazy module after the first open. */
let _usageImport: Promise<typeof import('./ui/usage.ts')>|null = null;
function _loadUsageModule() {
  if (!_usageImport) {
    _usageImport = import('./ui/usage.ts');
    _usageImport.then(function (m) { m.mountUsageListeners(); });
    _usageImport.catch(function (err) {
      _usageImport = null;
      console.error('[usage] failed to load', err);
    });
  }
  return _usageImport;
}
browserWindow.openUsageModal = function () { return _loadUsageModule().then(function (m) { return m.openUsageModal(); }); };
browserWindow.closeUsageModal = function () { if (_usageImport) return _usageImport.then(function (m) { return m.closeUsageModal(); }); };
browserWindow.loadUsageData = function () { if (_usageImport) return _usageImport.then(function (m) { return m.loadUsageData(); }); };
browserWindow.loadUsageMonth = function () { if (_usageImport) return _usageImport.then(function (m) { return m.loadUsageMonth(); }); };
browserWindow.showUsageTip = function (ev: Pick<Event, 'currentTarget'>) { if (_usageImport) return _usageImport.then(function (m) { return m.showUsageTip(ev); }); };
browserWindow.hideUsageTip = function () { if (_usageImport) return _usageImport.then(function (m) { return m.hideUsageTip(); }); };


/* ─── ui/knowledgePanel.ts ───
   updateKB is already a cross-module app entry point (session/loader.js,
   chat/sessionBootstrap.js and chat/sendPipeline.js all call it). Exposed
   here so the knowledge-map surface can be driven directly from e2e —
   the panel previously clobbered its own delegated renderer, which no
   existing spec could see because nothing called updateKB from a test. */
import { updateKB } from './ui/knowledgePanel.ts';
browserWindow.updateKB = updateKB;

/* ─── exam.js — Generate Exam extension ───
   The exam view stays lazy and loads only when opened (sidebar exam nav,
   openExamModal or exam-session restore). Its domain flows live under
   src/exam/. window.__loadExamModule dedupes the import, mounts delegated
   listeners once, and exposes it for account-change resets. */
let _examImport: Promise<typeof import('./exam.ts')>|null = null;
function _loadExamModule() {
  if (!_examImport) {
    _examImport = import('./exam.ts').then(function (m) {
      browserWindow.__examModule = m;
      try { m.mountExamListeners(); } catch (_) { /* empty-catch: intentional — mounting listeners is idempotent and non-fatal */ }
      return m;
    });
    _examImport.catch(function (err) {
      _examImport = null;
      console.error('[exam] failed to load', err);
    });
  }
  return _examImport;
}
browserWindow.__loadExamModule = _loadExamModule;
browserWindow.openExamPanel = function () { _loadExamModule().then(function (m: { openExamPanel: () => void; }) { m.openExamPanel(); }); };
browserWindow.openExamModal = function () { _loadExamModule().then(function (m: { openExamModal: () => void; }) { m.openExamModal(); }); };
/* Only refresh i18n when the exam module is already loaded — i18n.ts
   gates this on _examInView anyway, and a language switch must not
   pull in exam.js for users who never open the exam view. */
browserWindow.refreshExamI18n = function () {
  if (_examImport) _examImport.then(function (m: { refreshExamI18n: () => void; }) { m.refreshExamI18n(); });
};

/* ─── ui/toolCards.ts — needed by share.js to restore tool cards ─── */
import { appendToolModule } from './ui/toolCards.ts';
/* appendToolModule must stay on window: e2e/tool-card-lifecycle.spec.mjs
   mounts cards through it and polls for its presence. */
browserWindow.appendToolModule = appendToolModule;

/* ─── ui/greeting.js — ChatGPT-style personalized greeting (P_chatgpt-landing) ─── */
/* main.js imports renderGreeting directly; bare import keeps evaluation
   order. */
import './ui/greeting.js';

/* ─── P_chatgpt-landing — composer quick-action chips (撰写或编辑 /
   查找资料). Both reuse existing capabilities so no new backend is
   introduced. The actions themselves (composeAction / researchAction /
   exploreAction / deepResearchAction / analyzeAction) are now thin
   delegators into the extension registry (src/extensions/), which owns
   the prompts, icons, and side-effects. installWindowExtensionDelegates()
   only defines a window.X binding if one does not already exist, so it is
   safe to call here before/after any other binding. ─── */
import { installWindowExtensionDelegates } from './extensions/index.ts';
installWindowExtensionDelegates();

/* ─── extensions/chipSync.ts — quick-action chip mirror (M4)
    DOM ownership lives in extensions/chipSync.ts; this bridge only keeps
    the legacy `window.syncQuickChips` alias for extensions/context.ts. ─── */
import { syncQuickChips, mountChipSyncListeners } from './extensions/chipSync.ts';
browserWindow.syncQuickChips = function () { syncQuickChips(); };
mountChipSyncListeners();


/* ─── ui/effortPicker.ts — reasoning-effort (高/中/低) selector
   (P_chatgpt-landing). Exposes getReasoningEffort() consumed by
   chat/stream.js and the picker toggles used by inline handlers. ─── */
import { getReasoningEffort, syncEffortUI } from './ui/effortPicker.ts';
/* getReasoningEffort stays on window: chat/api.js (light import chain used
   by pure-Node unit tests) must not import ui/effortPicker.ts → pickers.js
   (top-level document wiring). */
browserWindow.getReasoningEffort = getReasoningEffort;
browserWindow.syncEffortUI = syncEffortUI;

/* ─── ui/readAloud.ts — browser TTS read-aloud for assistant messages
   (P_chatgpt-landing). No backend; uses window.speechSynthesis. ─── */
/* main.js imports toggleReadAloud directly; bare import keeps evaluation
   order. */
import './ui/readAloud.ts';

/* ─── chat/promptTemplates.ts — Skills & shortcuts data layer.
   Consumers (ui/promptTemplates.ts, main.js) import these directly;
   bare import keeps evaluation order. ─── */
import './chat/promptTemplates.ts';
import { runtimeWindow as browserWindow } from "./types/runtimeWindow.ts";
