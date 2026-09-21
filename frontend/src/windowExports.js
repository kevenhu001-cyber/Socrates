// @ts-check
// src/windowExports.js — Phase B central bridge
// Single source of truth for inline-handler-visible window.X bindings.
// All `onclick="X()"` / `onkeydown="X()"` in index.html and in
// dynamic innerHTML strings resolve via [[Resolve]] → window.X →
// this file's side-effects.
//
// Why side-effect import from main.js: Vite/esbuild's iife
// tree-shaking removes any `export` not statically referenced. We
// don't want a 150-line named import in main.js, so we use
// `import './windowExports.js'` to force the bundle to keep this
// module (and run all its `window.X = X` statements).
//
// Migration status:
//   ✓ Phase A:  displayPrefs / cheatsheet / scroll / localMemory /
//               stripMarkdown / socratic-prompt — moved to modules,
//               bridge lives here.
//   → Phase C:  remaining 148 self-defined functions in main.js will
//               be migrated to their own modules and added here
//               incrementally. Until then, main.js keeps a small
//               self-bridge for state vars (apiConfig / appMode / etc.)
//               and functions not yet extracted.

/* ─── auth/boot.js — boot-time flags ─── */
import { SERVER_HAS_BEAGLE_KEY } from './auth/boot.js';
window.SERVER_HAS_BEAGLE_KEY = SERVER_HAS_BEAGLE_KEY;

/* ─── config/providers.js — MUST come first (apiConfig consumed by every other module) ─── */
import { apiConfig, appMode, webSearchOn, extensiveThinkingOn, BEAGLE_BUILT_IN, isReasoningProvider, syncAppModeUI, setAppMode, thinkingOn } from './config/providers.js';
window.apiConfig = apiConfig;
window.appMode = appMode;
window.webSearchOn = webSearchOn;
window.extensiveThinkingOn = extensiveThinkingOn;
window.BEAGLE_BUILT_IN = BEAGLE_BUILT_IN;
window.isReasoningProvider = isReasoningProvider;
window.syncAppModeUI = syncAppModeUI;
window.setAppMode = setAppMode;
window.thinkingOn = thinkingOn;

/* ─── displayPrefs.js ─── */
/* Only toggleTheme stays on window (inline onclick in the prefs modal);
   every other displayPrefs consumer imports the module directly. */
import { toggleTheme } from './displayPrefs.js';
window.toggleTheme = toggleTheme;

/* ─── util/api.js ─── */
import { apiFetch, getCsrfToken } from './util/api.js';
window.apiFetch = apiFetch;
window.getCsrfToken = getCsrfToken;

/* ─── render/viz.js ─── */
import { processPendingVizActions, getLiveVizCardIds } from './render/viz.js';
/* mountVisualization / disposeVisualizations are imported directly by
   their consumers (main.js, share.js); no window surface is needed. */
import './render/visualization.js';
window.processPendingVizActions = processPendingVizActions;
/* E2E test surface: viz-canvas.spec.mjs asserts the iframe registry
   releases the entry after `viz-ready` fires. Expose a snapshot
   helper so the test can do `getLiveVizCardIds()` instead of
   poking the live map directly. */
window.getLiveVizCardIds = getLiveVizCardIds;

/* ─── ui/searchProgress.js — E2E test surface: search-progress.spec.mjs
   exercises the search-activity UI via window.__startSearchProgress. ─── */
import { startSearchProgress } from './ui/searchProgress.js';
window.__startSearchProgress = startSearchProgress;

/* ─── render/markdown.js ─── */
import { formatMsg } from './render/markdown.js';
window.formatMsg = formatMsg;

/* ─── auth/index.js ─── */
/* Only the gate entry points stay on window (index.html inline
   onclick). Every auth view/submit handler is invoked through
   auth/index.js's own module-local wiring. */
import { hideGate, showGate, showAuthSignin } from './auth/index.js';
window.hideGate = hideGate;
window.showGate = showGate;
window.showAuthSignin = showAuthSignin;

/* ─── sidebar/index.js ─── */
import { toggleSidebar, setRecentsFilter, getRecentsFilter, clearRecentsFilter, onRecentsFilterChipClick } from './sidebar/index.js';
window.toggleSidebar = toggleSidebar;
window.setRecentsFilter = setRecentsFilter;
window.getRecentsFilter = getRecentsFilter;
window.clearRecentsFilter = clearRecentsFilter;
window.onRecentsFilterChipClick = onRecentsFilterChipClick;

/* ─── pickers.js ─── */
/* Extension toggles / picker menus are wired module-locally; only the
   four model-pill entry points below stay on window (inline onclick in
   index.html + the composer pills). */
import {
  getActiveProvider,
  syncModelPills,
  syncChatModel,
  toggleWebSearch,
  markProvidersFetched,
} from './pickers.js';
window.getActiveProvider = getActiveProvider;
window.syncModelPills = syncModelPills;
window.syncChatModel = syncChatModel;
window.toggleWebSearch = toggleWebSearch;
window.markProvidersFetched = markProvidersFetched;

// Note: renderProviderList stays on window for config/providers.js, which
// cannot import ui/settings.js (providers.js must stay a zero-dependency
// leaf that loads first — the reverse edge already exists).

/* ─── ui/cheatsheet.js ─── */
import { closeCheatsheet, openCheatsheet } from './ui/cheatsheet.js';
/* PR-A — openCheatsheet is referenced inline by the More popover
   (More → Keyboard shortcuts) and was previously only reachable
   through the main.js keydown handler. Re-bridge it here so
   inline-handlers.spec.mjs sees a window.openCheatsheet binding. */
window.openCheatsheet = openCheatsheet;
/* The cheatsheet modal markup carries inline onclick="closeCheatsheet()"
   — inline handlers resolve from window, so this binding must stay. */
window.closeCheatsheet = closeCheatsheet;

/* ─── sidebar/nav.js (PR-A of the sidebar overhaul) ─── */
import { openNav, setActiveNav } from './sidebar/nav.js';
/* `openNav` is the dispatcher wired to the .sidebar-nav-btn onclick
   in index.html. `setActiveNav` is exposed for the morePopover
   module to clear the More button's active state on close (avoids
   a nav.js ↔ morePopover.js import cycle). */
window.openNav = openNav;
window.setActiveNav = setActiveNav;
/* PR-B/C/D/E — panel inline handlers. nav.js defines these on
   window.* directly, but we re-affirm the bridge here so the
   export audit trail is complete. */
import './sidebar/nav.js';

/* ─── sidebar/morePopover.js (PR-A) ─── */
import { closeMorePopover } from './sidebar/morePopover.js';
window.closeMorePopover = closeMorePopover;

/* ─── ui/confirm.js ─── */
import { closeConfirm, showConfirm } from './ui/confirm.js';
window.closeConfirm = closeConfirm;
window.showConfirm = showConfirm;

/* ─── ui/cmdK.js ─── */
import { closeCmdK, onCmdKInput, onCmdKKey, openCmdK } from './ui/cmdK.js';
window.closeCmdK = closeCmdK;
window.onCmdKInput = onCmdKInput;
window.onCmdKKey = onCmdKKey;
window.openCmdK = openCmdK;

/* ─── ui/findInSession.js — P0.2 in-session find (Ctrl-F) ─── */
import { openFindInSession, closeFindInSession, findNext, findPrev } from './ui/findInSession.js';
window.openFindInSession = openFindInSession;
window.closeFindInSession = closeFindInSession;
window.findNext = findNext;
window.findPrev = findPrev;

/* ─── ui/storage.js ─── */
/* Consumers (settings.js, React panels) import the storage modal
   directly; the bare import only keeps evaluation order. */
import './ui/storage.js';

/* ─── ui/promptTemplates.js ─── */
/* The modal's inline onclick handlers are wired inside
   ui/promptTemplates.js itself; main.js imports the module directly.
   Bare import keeps evaluation order. */
import './ui/promptTemplates.js';

/* ─── ui/composerTools.js ─── */
import { toggleComposerTools } from './ui/composerTools.js';
window.toggleComposerTools = toggleComposerTools;


/* ─── ui/voiceInput.js ─── */
import { stopSpeechInput, toggleSpeechInput } from './ui/voiceInput.js';
window.toggleSpeechInput = toggleSpeechInput;
window.stopSpeechInput = stopSpeechInput;
/* ─── ui/settings.js ─── */
/* React's SettingsModal calls these via __socratesLegacy.settings
   (assembled from main.js's direct imports); only the four inline-handler
   entry points below stay on window. */
import { openSettings, closeSettings, renderProviderList, addProvider } from './ui/settings.js';
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.renderProviderList = renderProviderList;
window.addProvider = addProvider;

/* ─── ui/share.js ─── */
/* Copy/load handlers are wired module-locally inside ui/share.js and by
   main.js's direct imports; only the topbar/entry points below stay on
   window. */
import { toggleChatTopBarEls, openShareModal, closeShareModal, revokeShareLink, createShareLink } from './ui/share.js';
window.toggleChatTopBarEls = toggleChatTopBarEls;
window.openShareModal = openShareModal;
window.closeShareModal = closeShareModal;
window.revokeShareLink = revokeShareLink;
window.createShareLink = createShareLink;

/* ─── ui/dangerConfirms.js ─── */
/* Confirm buttons resolve through ui/confirm.js's window surface;
   main.js imports the confirm actions directly. Bare import keeps
   evaluation order. */
import './ui/dangerConfirms.js';

/* ─── ui/profile.js ─── */
/* Profile handlers are wired module-locally; only the two inline-handler
   entry points below stay on window. */
import { closeProfile, openProfile } from './ui/profile.js';
window.closeProfile = closeProfile;
window.openProfile = openProfile;

/* ─── ui/scroll.js ─── */

/* ─── ui/topicSetup.js ─── */
/* Composer auto-resize is consumed via main.js's direct imports; bare
   import keeps evaluation order. */
import './ui/topicSetup.js';

/* ─── storage/localMemory.js ─── */

/* ─── storage/memoryStore.js — cross-session memory ─── */
/* Consumers (main.js, profile panel) import the memory layer directly;
   bare import keeps evaluation order. */
import './storage/memoryStore.js';

/* ─── config/tonePresets.js — AI tone/voice presets ─── */
/* Tone presets render inside ui/settings.js's own wiring; main.js
   imports the module directly. Bare import keeps evaluation order. */
import './config/tonePresets.js';

/* ─── agent/researchAgent.js — Deep Research / Agent Mode ─── */
import { startDeepResearch, launchDeepResearch } from './agent/researchAgent.js';
window.startDeepResearch = startDeepResearch;
window.launchDeepResearch = launchDeepResearch;

/* ─── attachments.js ─── */
// attachments is a mutable array reference shared across modules
// (chat/stream.js / render helpers / submitChatMessage all read it
// via window.attachments). The bridge must preserve identity — never
// replace it with a copy.
import { attachments, removeAttachment } from './attachments.js';
window.attachments = attachments;
window.removeAttachment = removeAttachment;

/* ─── attachments/render.js — renderAttachmentChips is consumed by
   React's legacyAdapter and by main.js for the attachment chip strip.
   It was exported but never bridged to window, causing
   window.__socratesLegacy.composer.renderAttachmentChips to be undefined. */
import { renderAttachmentChips } from './attachments/render.js';
window.renderAttachmentChips = renderAttachmentChips;

/* ─── i18n.js (setLang) ─── */
// i18n.js does not have ESM named exports — setLang is bound on
// `window.setLang` directly inside i18n.js (line 931) after the
// function is declared at module scope. We do a side-effect import
// to make sure i18n.js is evaluated first, then re-bind from window
// so this file remains the single bridge audit point.
import './i18n.js';
if (typeof window.setLang === 'function') {
  // Re-affirm in this bridge file (no-op if already set).
} else {
  // Defensive fallback if i18n.js refactor changes the binding point.
  window.setLang = function(){};
}

// Note: refreshApiConfig / handleRefreshProductInfo are still defined
// inside main.js. They will be migrated to a dedicated module in a
// later Phase C sub-step. For now main.js keeps them on window itself.

/* ─── chat/offline.js ─── */
import {
  STREAM_MAX_ATTEMPTS, STREAM_RETRYABLE_STATUS,
  offlineGuard, sleepBackoff,
} from './chat/offline.js';
window.STREAM_MAX_ATTEMPTS = STREAM_MAX_ATTEMPTS;
window.STREAM_RETRYABLE_STATUS = STREAM_RETRYABLE_STATUS;
window.offlineGuard = offlineGuard;
window.sleepBackoff = sleepBackoff;

/* ─── ui/usage.js ─── */
import { openUsageModal, closeUsageModal, loadUsageData, loadUsageMonth, showUsageTip, hideUsageTip } from './ui/usage.js';
window.openUsageModal = openUsageModal;
window.closeUsageModal = closeUsageModal;
window.loadUsageData = loadUsageData;
window.loadUsageMonth = loadUsageMonth;
window.showUsageTip = showUsageTip;
window.hideUsageTip = hideUsageTip;
/* Period tab inline onclick handlers (usage.js:138-139). */
/* Heatmap cell inline onmouseenter/onmouseleave handlers (usage.js:168). */

/* ─── render/helpers.js (esc alias) ─── */
import { esc } from './render/helpers.js';
window.esc = esc;

/* ─── exam.js — Generate Exam extension ───
   exam.js is a standalone module with its own imports (esc, formatMsg,
   callAPI). It renders inline onclick="..." handlers that reference
   functions on window.* — all of them must be bridged here. */
import {
  openExamPanel, openExamModal,
  refreshExamI18n,
} from './exam.js';
window.openExamPanel = openExamPanel;
/* openExamModal stays on window: pickers.js (in the light chat/api.js
   import chain) must not import exam.js, which drags ui/share.js →
   ui/toolCards.js (top-level document listener) into pure-Node unit tests. */
window.openExamModal = openExamModal;
window.refreshExamI18n = refreshExamI18n;

/* ─── ui/toolCards.js — needed by share.js to restore tool cards ─── */
import { appendToolModule } from './ui/toolCards.js';
/* appendToolModule must stay on window: e2e/tool-card-lifecycle.spec.mjs
   mounts cards through it and polls for its presence. */
window.appendToolModule = appendToolModule;

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

/* Mirror toggle-style state onto the quick-action chips (查找资料 reflects
   webSearchOn; 深度研究 reflects window.deepResearchOn). The 深度思考 chip
   was removed — deep thinking is now tied to the reasoning-effort picker
   (High = deep thinking). */
window.syncQuickChips = function () {
  var research = document.getElementById("quickResearchChip");
  if (research) research.classList.toggle("active", !!window.webSearchOn);
  var deep = document.getElementById("quickDeepResearchChip");
  if (deep) deep.classList.toggle("active", !!window.deepResearchOn);
};
if (typeof document !== "undefined") {
  var _syncChips = function () { try { window.syncQuickChips(); } catch (_) {} };
  window.addEventListener("DOMContentLoaded", _syncChips);
  if (document.readyState !== "loading") _syncChips();
}


/* ─── ui/effortPicker.js — reasoning-effort (高/中/低) selector
   (P_chatgpt-landing). Exposes getReasoningEffort() consumed by
   chat/stream.js and the picker toggles used by inline handlers. ─── */
import { getReasoningEffort, syncEffortUI } from './ui/effortPicker.js';
/* getReasoningEffort stays on window: chat/api.js (light import chain used
   by pure-Node unit tests) must not import ui/effortPicker.js → pickers.js
   (top-level document wiring). */
window.getReasoningEffort = getReasoningEffort;
window.syncEffortUI = syncEffortUI;

/* ─── ui/readAloud.js — browser TTS read-aloud for assistant messages
   (P_chatgpt-landing). No backend; uses window.speechSynthesis. ─── */
/* main.js imports toggleReadAloud directly; bare import keeps evaluation
   order. */
import './ui/readAloud.js';

/* ─── chat/promptTemplates.js — Skills & shortcuts data layer.
   Consumers (ui/promptTemplates.js, main.js) import these directly;
   bare import keeps evaluation order. ─── */
import './chat/promptTemplates.js';
