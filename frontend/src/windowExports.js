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
import { apiConfig, appMode, webSearchOn, extensiveThinkingOn, BEAGLE_BUILT_IN, isReasoningProvider, isMiniMaxProvider, pickStreamBudgets, syncAppModeUI, syncSidebarForMode, setAppMode, LAST_ACTIVE_ID_KEY, saveLastActiveId, thinkingOn } from './config/providers.js';
window.apiConfig = apiConfig;
window.appMode = appMode;
window.webSearchOn = webSearchOn;
window.extensiveThinkingOn = extensiveThinkingOn;
window.BEAGLE_BUILT_IN = BEAGLE_BUILT_IN;
window.isReasoningProvider = isReasoningProvider;
window.isMiniMaxProvider = isMiniMaxProvider;
window.pickStreamBudgets = pickStreamBudgets;
window.syncAppModeUI = syncAppModeUI;
window.syncSidebarForMode = syncSidebarForMode;
window.setAppMode = setAppMode;
window.LAST_ACTIVE_ID_KEY = LAST_ACTIVE_ID_KEY;
window.saveLastActiveId = saveLastActiveId;
window.thinkingOn = thinkingOn;

/* ─── displayPrefs.js ─── */
import {
  toggleGrid, setAccentColor, toggleDisplayPrefs, toggleTheme, setThemePreference, syncThemeUI,
  setAccentCustom, resetAccentColor,
  setBackgroundDark, setBackgroundLight, resetBackgroundDark, resetBackgroundLight,
} from './displayPrefs.js';
window.toggleDisplayPrefs = toggleDisplayPrefs;
window.toggleTheme = toggleTheme;
window.syncThemeUI = syncThemeUI;

/* ─── util/api.js ─── */
import { apiFetch, getCsrfToken } from './util/api.js';
window.apiFetch = apiFetch;
window.getCsrfToken = getCsrfToken;

/* ─── render/viz.js ─── */
import { openVizModal, openVizModalRaw, processPendingVizActions, getLiveVizCardIds } from './render/viz.js';
import { mountVisualization, disposeVisualizations } from './render/visualization.js';
window.__vizOpenModal = openVizModal;
window.__vizOpenModalRaw = openVizModalRaw;
window.mountVisualization = mountVisualization;
window.disposeVisualizations = disposeVisualizations;
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
import {
  hideGate, showGate, showAuthView, showAuthSignin,
  switchAuthTab, focusAuthTab,
  showAuthForgotPassword, showAuthCodeLogin,
  submitAuthSignin, submitAuthRegister, submitAuthVerify,
  submitAuthForgotPassword, submitAuthResetPassword,
  submitAuthSendCode, submitAuthLoginWithCode,
  resendVerification, resendAuthCode, afterAuthEnter,
} from './auth/index.js';
window.hideGate = hideGate;
window.showGate = showGate;
window.showAuthView = showAuthView;
window.showAuthSignin = showAuthSignin;
window.submitAuthVerify = submitAuthVerify;
window.afterAuthEnter = afterAuthEnter;

/* ─── sidebar/index.js ─── */
import { toggleSidebar, setRecentsFilter, getRecentsFilter, clearRecentsFilter, onRecentsFilterChipClick } from './sidebar/index.js';
window.toggleSidebar = toggleSidebar;
window.setRecentsFilter = setRecentsFilter;
window.getRecentsFilter = getRecentsFilter;
window.onRecentsFilterChipClick = onRecentsFilterChipClick;

/* ─── pickers.js ─── */
import {
  getActiveProvider, pickActiveProviderById,
  syncModelPills,
  syncChatModel,
  closeModelPicker, closeChatModelMenu,
  toggleExtensionByKey, syncExtensionsUI,
  toggleWebSearch, syncWebSearchUI,
  markProvidersFetched,
} from './pickers.js';
window.getActiveProvider = getActiveProvider;
window.pickActiveProviderById = pickActiveProviderById;
window.syncModelPills = syncModelPills;
window.syncChatModel = syncChatModel;
window.toggleExtensionByKey = toggleExtensionByKey;
window.syncExtensionsUI = syncExtensionsUI;
window.toggleWebSearch = toggleWebSearch;
window.markProvidersFetched = markProvidersFetched;

// Note: setActiveProvider / renderProviderList / isReasoningProvider are
// still defined inside main.js. They will be migrated to their own
// module (or to pickers.js) in a later Phase C sub-step. For now
// main.js keeps them on window itself.

/* ─── ui/cheatsheet.js ─── */
import { closeCheatsheet, openCheatsheet } from './ui/cheatsheet.js';
window.closeCheatsheet = closeCheatsheet;
/* PR-A — openCheatsheet is referenced inline by the More popover
   (More → Keyboard shortcuts) and was previously only reachable
   through the main.js keydown handler. Re-bridge it here so
   inline-handlers.spec.mjs sees a window.openCheatsheet binding. */
window.openCheatsheet = openCheatsheet;

/* ─── sidebar/nav.js (PR-A of the sidebar overhaul) ─── */
import { openNav, setActiveNav, syncWorkspaceRoute } from './sidebar/nav.js';
/* `openNav` is the dispatcher wired to the .sidebar-nav-btn onclick
   in index.html. `setActiveNav` is exposed for the morePopover
   module to clear the More button's active state on close (avoids
   a nav.js ↔ morePopover.js import cycle). `syncWorkspaceRoute` is
   public for tests and any future cross-panel navigators. */
window.openNav = openNav;
window.setActiveNav = setActiveNav;
window.syncWorkspaceRoute = syncWorkspaceRoute;
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
import { openFindInSession, closeFindInSession, onFindInput, onFindKey, findNext, findPrev, isFindOpen } from './ui/findInSession.js';
window.openFindInSession = openFindInSession;
window.closeFindInSession = closeFindInSession;
window.findNext = findNext;
window.findPrev = findPrev;
window.isFindOpen = isFindOpen;

/* ─── ui/storage.js ─── */
import { openStorageModal, closeStorageModal } from './ui/storage.js';
window.openStorageModal = openStorageModal;
window.closeStorageModal = closeStorageModal;

/* ─── ui/promptTemplates.js ─── */
import {
  openPromptTemplatesModal, closePromptTemplatesModal, renderPromptTemplatesModal,
  openPromptTemplateEditor, onPromptRowDelete, onPromptTemplateEditorSave,
} from './ui/promptTemplates.js';
window.openPromptTemplatesModal = openPromptTemplatesModal;
window.closePromptTemplatesModal = closePromptTemplatesModal;
/* Inline onclick handlers inside the bridge-published modal HTML
   resolve these from window. */

/* ─── ui/composerTools.js ─── */
import { toggleComposerTools } from './ui/composerTools.js';
window.toggleComposerTools = toggleComposerTools;


/* ─── ui/voiceInput.js ─── */
import { stopSpeechInput, toggleSpeechInput } from './ui/voiceInput.js';
window.toggleSpeechInput = toggleSpeechInput;
/* ─── ui/settings.js ─── */
import { openSettings, closeSettings, syncSettingsUI, renderProviderList, setActiveProvider, toggleAPI, addProvider, clearSettings, saveSettings } from './ui/settings.js';
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.syncSettingsUI = syncSettingsUI;
window.renderProviderList = renderProviderList;
window.setActiveProvider = setActiveProvider;
/* M4 step 4.5b — React's SettingsModal buttons call these via
   __socratesLegacy.settings; the window.* aliases keep legacy JS + e2e
   probes working. */
window.toggleAPI = toggleAPI;
window.addProvider = addProvider;
window.clearSettings = clearSettings;
window.saveSettings = saveSettings;

/* ─── ui/share.js ─── */
import { toggleShareBtn, toggleChatTopBarEls, openShareModal, closeShareModal, selectShareVis, createShareLink, copyShareLink, revokeShareLink, loadSharedSession, _shareToken } from './ui/share.js';
window.toggleShareBtn = toggleShareBtn;
window.toggleChatTopBarEls = toggleChatTopBarEls;
window.openShareModal = openShareModal;
window.closeShareModal = closeShareModal;
window.selectShareVis = selectShareVis;
window.copyShareLink = copyShareLink;
window.revokeShareLink = revokeShareLink;
window.createShareLink = createShareLink;
window.loadSharedSession = loadSharedSession;
window._shareToken = _shareToken;

/* ─── ui/dangerConfirms.js ─── */
import { confirmClearCache, confirmClearSettings, confirmDeleteAccount } from './ui/dangerConfirms.js';
window.confirmClearCache = confirmClearCache;
window.confirmClearSettings = confirmClearSettings;
window.confirmDeleteAccount = confirmDeleteAccount;

/* ─── ui/profile.js ─── */
import { closeProfile, onCustomInstructionsChange, toggleProfileWebSearch, renderUserFooter, openProfile, loadUserMemories, saveProfileName } from './ui/profile.js';
window.loadUserMemories = loadUserMemories;
window.closeProfile = closeProfile;
window.onCustomInstructionsChange = onCustomInstructionsChange;
window.toggleProfileWebSearch = toggleProfileWebSearch;
window.renderUserFooter = renderUserFooter;
window.openProfile = openProfile;
window.saveProfileName = saveProfileName;

/* ─── ui/scroll.js ─── */

/* ─── ui/topicSetup.js ─── */
import { autoResize, updateStartBtn, updateSendBtn } from './ui/topicSetup.js';

/* ─── storage/localMemory.js ─── */

/* ─── storage/memoryStore.js — cross-session memory ─── */
import { injectMemoryContext, loadMemories } from './storage/memoryStore.js';
window.injectMemoryContext = injectMemoryContext;
window.loadMemories = loadMemories;

/* ─── config/tonePresets.js — AI tone/voice presets ─── */
import { loadTonePreset, setTonePreset, getTonePreset, getToneVoice, renderTonePresets } from './config/tonePresets.js';
window.loadTonePreset = loadTonePreset;
window.setTonePreset = setTonePreset;
window.getTonePreset = getTonePreset;
window.getToneVoice = getToneVoice;
window.renderTonePresets = renderTonePresets;

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
  STREAM_TIMEOUT_MS, STREAM_HEARTBEAT_MS, STREAM_MAX_ATTEMPTS, STREAM_RETRYABLE_STATUS,
  offlineGuard, sleepBackoff, makeAIWatchdog,
} from './chat/offline.js';
window.STREAM_TIMEOUT_MS = STREAM_TIMEOUT_MS;
window.STREAM_HEARTBEAT_MS = STREAM_HEARTBEAT_MS;
window.STREAM_MAX_ATTEMPTS = STREAM_MAX_ATTEMPTS;
window.offlineGuard = offlineGuard;
window.makeAIWatchdog = makeAIWatchdog;

/* ─── ui/usage.js ─── */
import { openUsageModal, closeUsageModal, loadUsageData, loadUsageMonth, showUsageTip, hideUsageTip } from './ui/usage.js';
window.openUsageModal = openUsageModal;
window.closeUsageModal = closeUsageModal;
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
  openExamPanel, prepareExamView, openExamModal, closeExamView,
  toggleExamType, toggleExamModelMenu, selectExamModel,
  selectExamDifficulty, adjustExamCount,
  startExamGeneration, cancelExamGeneration,
  selectExamOpt,
  examNavJump, examNavStep,
  submitExam,
  setExamAnswer,
  renderExamForm,
  refreshExamI18n,
} from './exam.js';
window.openExamPanel = openExamPanel;
window.prepareExamView = prepareExamView;
window.openExamModal = openExamModal;
window.refreshExamI18n = refreshExamI18n;

/* ─── ui/toolCards.js — needed by share.js to restore tool cards ─── */
import { appendToolModule, appendInlineArtifact, appendFileChangeSummaryCards } from './ui/toolCards.js';
window.appendToolModule = appendToolModule;
window.appendInlineArtifact = appendInlineArtifact;
window.appendFileChangeSummaryCards = appendFileChangeSummaryCards;

/* ─── ui/greeting.js — ChatGPT-style personalized greeting (P_chatgpt-landing) ─── */
import { renderGreeting } from './ui/greeting.js';
window.renderGreeting = renderGreeting;

/* ─── Sidebar-nav "Library" alias (P_chatgpt-landing) — opens the
   existing knowledge panel. toggleSidebarView('knowledge') is in main.js
   and not yet bridged here, so we mirror the call inline. ─── */
window.openKnowledge = function () {
  try {
    if (typeof window.toggleSidebarView === "function") {
      window.toggleSidebarView("knowledge");
      return;
    }
    var btn = document.getElementById("tabKnowledge");
    if (btn) btn.click();
  } catch (_) { /* swallow — no-op fallback */ }
};

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
import { getReasoningEffort, setReasoningEffort, toggleEffortPicker, syncEffortUI } from './ui/effortPicker.js';
window.getReasoningEffort = getReasoningEffort;
window.syncEffortUI = syncEffortUI;

/* ─── ui/readAloud.js — browser TTS read-aloud for assistant messages
   (P_chatgpt-landing). No backend; uses window.speechSynthesis. ─── */
import { toggleReadAloud } from './ui/readAloud.js';
window.toggleReadAloud = toggleReadAloud;

/* ─── chat/promptTemplates.js — Skills & shortcuts data layer.
   The Phase C1 bridge cleanup (commit 4ae9b5c) dropped these five
   bindings, but ui/promptTemplates.js still calls them as window.X;
   restoring them fixes a regression where openPromptTemplatesModal()
   throws "window.loadPromptTemplates is not a function" and the modal
   body (with its title/shortcut/description/body/systemPrompt inputs)
   never renders. ─── */
import {
  loadPromptTemplates, savePromptTemplates, findTemplateByShortcut,
  upsertCustomTemplate, deleteCustomTemplate,
} from './chat/promptTemplates.js';
window.loadPromptTemplates = loadPromptTemplates;
window.findTemplateByShortcut = findTemplateByShortcut;
window.upsertCustomTemplate = upsertCustomTemplate;
window.deleteCustomTemplate = deleteCustomTemplate;
