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
import { apiConfig, appMode, webSearchOn, setWebSearchOn, extensiveThinkingOn, BEAGLE_BUILT_IN, isReasoningProvider, isMiniMaxProvider, pickStreamBudgets, hasUsableActive, ensureSessionShape, syncAppModeUI, syncSidebarForMode, LAST_ACTIVE_ID_KEY, saveLastActiveId, loadLastActiveId, thinkingOn } from './config/providers.js';
window.apiConfig = apiConfig;
window.appMode = appMode;
window.webSearchOn = webSearchOn;
window.setWebSearchOn = setWebSearchOn;
window.extensiveThinkingOn = extensiveThinkingOn;
window.BEAGLE_BUILT_IN = BEAGLE_BUILT_IN;
window.isReasoningProvider = isReasoningProvider;
window.isMiniMaxProvider = isMiniMaxProvider;
window.pickStreamBudgets = pickStreamBudgets;
window.hasUsableActive = hasUsableActive;
window.ensureSessionShape = ensureSessionShape;
window.syncAppModeUI = syncAppModeUI;
window.syncSidebarForMode = syncSidebarForMode;
window.LAST_ACTIVE_ID_KEY = LAST_ACTIVE_ID_KEY;
window.saveLastActiveId = saveLastActiveId;
window.loadLastActiveId = loadLastActiveId;
window.thinkingOn = thinkingOn;

/* ─── util/colors.js ─── */
import { parseHexColor, applyCustomBg, removeCustomBg } from './util/colors.js';
window.parseHexColor = parseHexColor;
window.applyCustomBg = applyCustomBg;
window.removeCustomBg = removeCustomBg;

/* ─── displayPrefs.js ─── */
import {
  setDisplayFont, setDisplayWidth,
  setBackgroundColor, setBackgroundDark, setBackgroundLight,
  resetBackgroundColor, resetBackgroundDark, resetBackgroundLight,
  toggleGrid, setAccentColor, toggleDisplayPrefs, toggleTheme,
} from './displayPrefs.js';
window.setDisplayFont = setDisplayFont;
window.setDisplayWidth = setDisplayWidth;
window.setBackgroundColor = setBackgroundColor;
window.setBackgroundDark = setBackgroundDark;
window.setBackgroundLight = setBackgroundLight;
window.resetBackgroundColor = resetBackgroundColor;
window.resetBackgroundDark = resetBackgroundDark;
window.resetBackgroundLight = resetBackgroundLight;
window.toggleGrid = toggleGrid;
window.setAccentColor = setAccentColor;
window.toggleDisplayPrefs = toggleDisplayPrefs;
window.toggleTheme = toggleTheme;

/* ─── util/api.js ─── */
import { apiFetch, apiFetchRaw, retryApiFetch, getCsrfToken } from './util/api.js';
window.apiFetch = apiFetch;
window.apiFetchRaw = apiFetchRaw;
window.retryApiFetch = retryApiFetch;
window.getCsrfToken = getCsrfToken;

/* ─── util/safe.js ─── */
import { escapeHtml, sanitizeUrl, sanitizeUrls } from './util/safe.js';
window.escapeHtml = escapeHtml;
window.sanitizeUrl = sanitizeUrl;
window.sanitizeUrls = sanitizeUrls;

/* ─── render/viz.js ─── */
import { openVizModal, openVizModalRaw, processPendingViz, processPendingVizActions, getLiveVizCardIds } from './render/viz.js';
import { mountVisualization, disposeVisualizations } from './render/visualization.js';
window.__vizOpenModal = openVizModal;
window.__vizOpenModalRaw = openVizModalRaw;
window.processPendingViz = processPendingViz;
window.mountVisualization = mountVisualization;
window.disposeVisualizations = disposeVisualizations;
window.processPendingVizActions = processPendingVizActions;
/* E2E test surface: viz-canvas.spec.mjs asserts the iframe registry
   releases the entry after `viz-ready` fires. Expose a snapshot
   helper so the test can do `getLiveVizCardIds()` instead of
   poking the live map directly. */
window.getLiveVizCardIds = getLiveVizCardIds;

/* ─── ui/searchProgress.js — internal bridge used by smoke tests and
   non-chat surfaces that need to mount the same search activity UI. ─── */
import { startSearchProgress } from './ui/searchProgress.js';
window.__startSearchProgress = startSearchProgress;

/* ─── render/markdown.js ─── */
import { stripMarkdown, findLastUserMessage, formatMsg } from './render/markdown.js';
window.stripMarkdown = stripMarkdown;
window.findLastUserMessage = findLastUserMessage;
window.formatMsg = formatMsg;

/* ─── auth/index.js ─── */
import {
  hideGate, showGate, showAuthView, showAuthSignin, showAuthRegister,
  switchAuthTab, setAuthError,
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
window.showAuthRegister = showAuthRegister;
window.switchAuthTab = switchAuthTab;
window.setAuthError = setAuthError;
window.showAuthForgotPassword = showAuthForgotPassword;
window.showAuthCodeLogin = showAuthCodeLogin;
window.submitAuthSignin = submitAuthSignin;
window.submitAuthRegister = submitAuthRegister;
window.submitAuthVerify = submitAuthVerify;
window.submitAuthForgotPassword = submitAuthForgotPassword;
window.submitAuthResetPassword = submitAuthResetPassword;
window.submitAuthSendCode = submitAuthSendCode;
window.submitAuthLoginWithCode = submitAuthLoginWithCode;
window.resendVerification = resendVerification;
window.resendAuthCode = resendAuthCode;
window.afterAuthEnter = afterAuthEnter;

/* ─── sidebar/index.js ─── */
import { toggleSidebar, setRecentsFilter, clearRecentsFilter, onRecentsFilterChipClick } from './sidebar/index.js';
window.toggleSidebar = toggleSidebar;
window.setRecentsFilter = setRecentsFilter;
window.clearRecentsFilter = clearRecentsFilter;
window.onRecentsFilterChipClick = onRecentsFilterChipClick;

/* ─── pickers.js ─── */
import {
  getActiveProvider, pickActiveProviderById,
  toggleModelPicker, openModelPicker, closeModelPicker, syncModelPills,
  syncChatModel, toggleChatModelMenu, closeChatModelMenu, pickChatModel,
  renderExtensionsMenu, toggleExtensionByKey, countActiveExtensions, syncExtensionsUI,
  toggleExtensionsPicker, openExtensionsPicker, closeExtensionsPicker,
  toggleWebSearch, syncWebSearchUI, markProvidersFetched,
} from './pickers.js';
window.getActiveProvider = getActiveProvider;
window.pickActiveProviderById = pickActiveProviderById;
window.toggleModelPicker = toggleModelPicker;
window.openModelPicker = openModelPicker;
window.closeModelPicker = closeModelPicker;
window.syncModelPills = syncModelPills;
window.syncChatModel = syncChatModel;
window.toggleChatModelMenu = toggleChatModelMenu;
window.closeChatModelMenu = closeChatModelMenu;
window.pickChatModel = pickChatModel;
window.renderExtensionsMenu = renderExtensionsMenu;
window.toggleExtensionByKey = toggleExtensionByKey;
window.countActiveExtensions = countActiveExtensions;
window.syncExtensionsUI = syncExtensionsUI;
window.toggleExtensionsPicker = toggleExtensionsPicker;
window.openExtensionsPicker = openExtensionsPicker;
window.closeExtensionsPicker = closeExtensionsPicker;
window.toggleWebSearch = toggleWebSearch;
window.syncWebSearchUI = syncWebSearchUI;
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
import { openNav, setActiveNav, closeAllPanels } from './sidebar/nav.js';
/* `openNav` is the dispatcher wired to the .sidebar-nav-btn onclick
   in index.html. `setActiveNav` is exposed for the morePopover
   module to clear the More button's active state on close (avoids
   a nav.js ↔ morePopover.js import cycle). `closeAllPanels` is
   public for tests and any future cross-panel navigators. */
window.openNav = openNav;
window.setActiveNav = setActiveNav;
window.closeAllPanels = closeAllPanels;
/* PR-B/C/D/E — panel inline handlers. nav.js defines these on
   window.* directly, but we re-affirm the bridge here so the
   export audit trail is complete. */
import './sidebar/nav.js';

/* ─── sidebar/morePopover.js (PR-A) ─── */
import { closeMorePopover, toggleMorePopover } from './sidebar/morePopover.js';
/* `closeMorePopover` is called inline by each More-menu item's
   onclick so the popover dismisses before the underlying action
   (openSettings / signOut / etc.) runs. `toggleMorePopover` is
   also exposed for completeness (tests may want to open/close
   the popover programmatically). */
window.closeMorePopover = closeMorePopover;
window.toggleMorePopover = toggleMorePopover;

/* ─── ui/confirm.js ─── */
import { closeConfirm, showConfirm } from './ui/confirm.js';
window.closeConfirm = closeConfirm;
window.showConfirm = showConfirm;

/* ─── ui/cmdK.js ─── */
import { closeCmdK, onCmdKInput, onCmdKKey, openCmdK, rebuildCmdKIndex } from './ui/cmdK.js';
window.closeCmdK = closeCmdK;
window.onCmdKInput = onCmdKInput;
window.onCmdKKey = onCmdKKey;
window.openCmdK = openCmdK;
window.rebuildCmdKIndex = rebuildCmdKIndex;

/* ─── ui/findInSession.js — P0.2 in-session find (Ctrl-F) ─── */
import { openFindInSession, closeFindInSession, onFindInput, onFindKey, findNext, findPrev, isFindOpen } from './ui/findInSession.js';
window.openFindInSession = openFindInSession;
window.closeFindInSession = closeFindInSession;
window.onFindInput = onFindInput;
window.onFindKey = onFindKey;
window.findNext = findNext;
window.findPrev = findPrev;
window.isFindOpen = isFindOpen;

/* ─── ui/storage.js ─── */
import { openStorageModal, closeStorageModal, renderArchivedList } from './ui/storage.js';
window.openStorageModal = openStorageModal;
window.closeStorageModal = closeStorageModal;

/* ─── ui/promptTemplates.js ─── */
import { openPromptTemplatesModal, closePromptTemplatesModal, renderPromptTemplatesModal, renderPromptRow, onPromptRowDelete, openPromptTemplateEditor, onPromptTemplateEditorSave } from './ui/promptTemplates.js';
window.openPromptTemplatesModal = openPromptTemplatesModal;
window.closePromptTemplatesModal = closePromptTemplatesModal;
window.renderPromptTemplatesModal = renderPromptTemplatesModal;
window.renderPromptRow = renderPromptRow;
window.onPromptRowDelete = onPromptRowDelete;
window.openPromptTemplateEditor = openPromptTemplateEditor;
window.onPromptTemplateEditorSave = onPromptTemplateEditorSave;

/* ─── ui/settings.js ─── */
import { openSettings, closeSettings, toggleAPI, syncSettingsUI, renderProviderList, addProvider, removeProvider, setActiveProvider, updateProviderField, saveSettings, clearSettings, bindSettingsUI } from './ui/settings.js';
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.toggleAPI = toggleAPI;
window.syncSettingsUI = syncSettingsUI;
window.renderProviderList = renderProviderList;
window.addProvider = addProvider;
window.removeProvider = removeProvider;
window.setActiveProvider = setActiveProvider;
window.updateProviderField = updateProviderField;
window.saveSettings = saveSettings;
window.clearSettings = clearSettings;
window.bindSettingsUI = bindSettingsUI;

/* ─── ui/share.js ─── */
import { toggleShareBtn, toggleChatTopBarEls, openShareModal, closeShareModal, selectShareVis, createShareLink, copyShareLink, revokeShareLink, loadSharedSession, loadSharedExamSession, renderSharedQuestionCard, _shareToken, _shareUrl, _shareVisibility } from './ui/share.js';
window.toggleShareBtn = toggleShareBtn;
window.toggleChatTopBarEls = toggleChatTopBarEls;
window.openShareModal = openShareModal;
window.closeShareModal = closeShareModal;
window.selectShareVis = selectShareVis;
window.copyShareLink = copyShareLink;
window.revokeShareLink = revokeShareLink;
window.createShareLink = createShareLink;
window.loadSharedSession = loadSharedSession;
window.loadSharedExamSession = loadSharedExamSession;
window.renderSharedQuestionCard = renderSharedQuestionCard;
window._shareToken = _shareToken;
window._shareUrl = _shareUrl;
window._shareVisibility = _shareVisibility;

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
import { scrollContainer } from './ui/scroll.js';
window.scrollContainer = scrollContainer;

/* ─── ui/topicSetup.js ─── */
import { autoResize, updateStartBtn, updateSendBtn } from './ui/topicSetup.js';
window.autoResize = autoResize;
window.updateStartBtn = updateStartBtn;
window.updateSendBtn = updateSendBtn;

/* ─── storage/localMemory.js ─── */
import { loadLocalMemory, appendLocalMemory, clearLocalMemory, _memKey } from './storage/localMemory.js';
window.loadLocalMemory = loadLocalMemory;
window.appendLocalMemory = appendLocalMemory;
window.clearLocalMemory = clearLocalMemory;

/* ─── storage/memoryStore.js — cross-session memory ─── */
import { memoryStore, setMemory, removeMemory, getAllMemories, clearAllMemories, injectMemoryContext, loadFromServer, loadMemories } from './storage/memoryStore.js';
window.memoryStore = memoryStore;
window.setMemory = setMemory;
window.removeMemory = removeMemory;
window.getAllMemories = getAllMemories;
window.clearAllMemories = clearAllMemories;
window.injectMemoryContext = injectMemoryContext;
window.loadMemories = loadMemories;
window.loadFromServer = loadFromServer;

/* ─── config/tonePresets.js — AI tone/voice presets ─── */
import { loadTonePreset, setTonePreset, getTonePreset, getToneVoice, getAvailablePresets, renderTonePresets, syncTonePresetUI } from './config/tonePresets.js';
window.loadTonePreset = loadTonePreset;
window.setTonePreset = setTonePreset;
window.getTonePreset = getTonePreset;
window.getToneVoice = getToneVoice;
window.getAvailablePresets = getAvailablePresets;
window.renderTonePresets = renderTonePresets;
window.syncTonePresetUI = syncTonePresetUI;

/* ─── agent/researchAgent.js — Deep Research / Agent Mode ─── */
import { startDeepResearch, launchDeepResearch } from './agent/researchAgent.js';
window.startDeepResearch = startDeepResearch;
window.launchDeepResearch = launchDeepResearch;

window._memKey = _memKey;

/* ─── attachments.js ─── */
// attachments is a mutable array reference shared across modules
// (chat/stream.js / render helpers / submitChatMessage all read it
// via window.attachments). The bridge must preserve identity — never
// replace it with a copy.
import { attachments, removeAttachment, buildMessageContent } from './attachments.js';
window.attachments = attachments;
window.removeAttachment = removeAttachment;
window.buildMessageContent = buildMessageContent;

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
window.STREAM_RETRYABLE_STATUS = STREAM_RETRYABLE_STATUS;
window.offlineGuard = offlineGuard;
window.sleepBackoff = sleepBackoff;
window.makeAIWatchdog = makeAIWatchdog;

/* ─── ui/usage.js ─── */
import { openUsageModal, closeUsageModal, loadUsageData, loadUsageMonth, showUsageTip, hideUsageTip } from './ui/usage.js';
window.openUsageModal = openUsageModal;
window.closeUsageModal = closeUsageModal;
window.loadUsageData = loadUsageData;
window.loadUsageMonth = loadUsageMonth;
window.showUsageTip = showUsageTip;
window.hideUsageTip = hideUsageTip;

/* ─── render/helpers.js (esc alias) ─── */
import { esc } from './render/helpers.js';
window.esc = esc;

/* ─── exam.js — Generate Exam extension ───
   exam.js is a standalone module with its own imports (esc, formatMsg,
   callAPI). It renders inline onclick="..." handlers that reference
   functions on window.* — all of them must be bridged here. */
import {
  openExamModal, closeExamModal, closeExamView,
  renderExamForm, toggleExamType, toggleExamModelMenu, selectExamModel,
  startExamGeneration, cancelExamGeneration,
  parseExamArrayJSON,
  paintQuestionCard, replaceStreamingCardWithQuestion, appendExamErrorCard,
  selectExamOpt,
  examNavJump, examNavStep, refreshExamNavTally,
  scheduleExamAnswerSave,
  submitExam, renderExamResults,
} from './exam.js';
window.openExamModal = openExamModal;
window.closeExamModal = closeExamModal;
window.closeExamView = closeExamView;
window.renderExamForm = renderExamForm;
window.toggleExamType = toggleExamType;
window.toggleExamModelMenu = toggleExamModelMenu;
window.selectExamModel = selectExamModel;
window.startExamGeneration = startExamGeneration;
window.cancelExamGeneration = cancelExamGeneration;
window.parseExamArrayJSON = parseExamArrayJSON;
window.paintQuestionCard = paintQuestionCard;
window.replaceStreamingCardWithQuestion = replaceStreamingCardWithQuestion;
window.appendExamErrorCard = appendExamErrorCard;
window.selectExamOpt = selectExamOpt;
window.examNavJump = examNavJump;
window.examNavStep = examNavStep;
window.refreshExamNavTally = refreshExamNavTally;
window.scheduleExamAnswerSave = scheduleExamAnswerSave;
window.submitExam = submitExam;
window.renderExamResults = renderExamResults;

/* ─── ui/toolCards.js — needed by share.js to restore tool cards ─── */
import { appendToolModule, appendInlineArtifact } from './ui/toolCards.js';
window.appendToolModule = appendToolModule;
window.appendInlineArtifact = appendInlineArtifact;

/* ─── ui/greeting.js — ChatGPT-style personalized greeting (P_chatgpt-landing) ─── */
import { renderGreeting } from './ui/greeting.js';
window.renderGreeting = renderGreeting;

/* ─── ui/voiceInput.js — Mic button placeholder ─── */
import { wireVoiceInput } from './ui/voiceInput.js';
window.wireVoiceInput = wireVoiceInput;

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
   introduced. Defined inline here (the single window-bridge file) to
   keep them next to the other lightweight UI globals. ─── */

/* 撰写或编辑 — prime the visible composer with a writing scaffold so the
   action does something tangible, then focus with the caret at the end.
   Targets the chat textarea when a session is live, else the landing one. */
window.composeAction = function () {
  var chat = document.getElementById("chatInputArea");
  var topic = document.getElementById("topicInput");
  var chatVisible = chat && chat.offsetParent !== null;
  var input = chatVisible ? chat : (topic || chat);
  if (!input) return;
  var scaffold = (typeof window.t === "function" && window.t("composer.write.scaffold")) || "Help me write or edit: ";
  if (scaffold && scaffold !== "composer.write.scaffold" &&
      input.value.indexOf(scaffold) !== 0) {
    input.value = scaffold + (input.value || "");
  }
  input.focus();
  try {
    var end = input.value.length;
    input.setSelectionRange(end, end);
  } catch (_) {}
  try {
    if (typeof window.autoResize === "function") window.autoResize(input);
    if (typeof window.updateStartBtn === "function") window.updateStartBtn();
    if (typeof window.updateSendBtn === "function") window.updateSendBtn();
  } catch (_) {}
};

/* 查找资料 — toggle web search on/off. When turning on with existing text,
   launch Deep Research directly (same entry the old Extensions toggle used).
   The chip's .active state mirrors window.webSearchOn via syncQuickChips(). */
window.researchAction = function () {
  var chat = document.getElementById("chatInputArea");
  var topic = document.getElementById("topicInput");
  var input = (chat && chat.offsetParent !== null) ? chat : (topic || chat);
  var hasText = input && input.value && input.value.trim().length > 0;
  var wasOn = (typeof window.webSearchOn !== "undefined") && !!window.webSearchOn;
  if (typeof window.toggleWebSearch === "function") window.toggleWebSearch();
  /* If we just turned search ON and there's already a prompt, kick off
     Deep Research on it immediately. */
  if (!wasOn && hasText && typeof window.launchDeepResearch === "function") {
    window.launchDeepResearch();
  } else if (input) {
    input.focus();
  }
  window.syncQuickChips();
};

/* Mirror toggle-style extension/search state onto the quick-action chips
   (深度思考 reflects extensiveThinkingOn; 查找资料 reflects webSearchOn). */
window.syncQuickChips = function () {
  var think = document.getElementById("quickThinkChip");
  if (think) think.classList.toggle("active", !!window.extensiveThinkingOn);
  var research = document.getElementById("quickResearchChip");
  if (research) research.classList.toggle("active", !!window.webSearchOn);
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
window.setReasoningEffort = setReasoningEffort;
window.toggleEffortPicker = toggleEffortPicker;
window.syncEffortUI = syncEffortUI;

/* ─── ui/readAloud.js — browser TTS read-aloud for assistant messages
   (P_chatgpt-landing). No backend; uses window.speechSynthesis. ─── */
import { toggleReadAloud, stopSpeaking } from './ui/readAloud.js';
window.toggleReadAloud = toggleReadAloud;
window.stopSpeaking = stopSpeaking;
