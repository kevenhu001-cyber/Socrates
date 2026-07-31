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
  toggleGrid, setAccentColor, toggleDisplayPrefs, toggleTheme,
  setAccentCustom, resetAccentColor,
  setBackgroundDark, setBackgroundLight, resetBackgroundDark, resetBackgroundLight,
} from './displayPrefs.js';
window.toggleGrid = toggleGrid;
window.setAccentColor = setAccentColor;
window.toggleDisplayPrefs = toggleDisplayPrefs;
window.toggleTheme = toggleTheme;
window.setAccentCustom = setAccentCustom;
window.resetAccentColor = resetAccentColor;
window.setBackgroundDark = setBackgroundDark;
window.setBackgroundLight = setBackgroundLight;
window.resetBackgroundDark = resetBackgroundDark;
window.resetBackgroundLight = resetBackgroundLight;

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
  switchAuthTab,
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
window.switchAuthTab = switchAuthTab;
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
import { toggleSidebar, setRecentsFilter, getRecentsFilter, clearRecentsFilter, onRecentsFilterChipClick } from './sidebar/index.js';
window.toggleSidebar = toggleSidebar;
window.setRecentsFilter = setRecentsFilter;
window.clearRecentsFilter = clearRecentsFilter;
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
window.closeModelPicker = closeModelPicker;
window.closeChatModelMenu = closeChatModelMenu;
window.toggleExtensionByKey = toggleExtensionByKey;
window.syncExtensionsUI = syncExtensionsUI;
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
window.onFindInput = onFindInput;
window.onFindKey = onFindKey;
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
import {
  focusComposer,
  getComposerMarkdown,
  getVisibleComposerSurface,
} from './react/composer-input/controller.ts';
window.openPromptTemplatesModal = openPromptTemplatesModal;
window.closePromptTemplatesModal = closePromptTemplatesModal;
/* Inline onclick handlers inside the bridge-published modal HTML
   resolve these from window. */
window.renderPromptTemplatesModal = renderPromptTemplatesModal;
window.openPromptTemplateEditor = openPromptTemplateEditor;
window.onPromptRowDelete = onPromptRowDelete;
window.onPromptTemplateEditorSave = onPromptTemplateEditorSave;

/* ─── ui/composerTools.js ─── */
import { toggleComposerTools } from './ui/composerTools.js';
window.toggleComposerTools = toggleComposerTools;

/* ─── ui/settings.js ─── */
import { openSettings, closeSettings, syncSettingsUI, renderProviderList, setActiveProvider } from './ui/settings.js';
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.syncSettingsUI = syncSettingsUI;
window.renderProviderList = renderProviderList;
window.setActiveProvider = setActiveProvider;

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
window.autoResize = autoResize;
window.updateStartBtn = updateStartBtn;
window.updateSendBtn = updateSendBtn;

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
window.STREAM_RETRYABLE_STATUS = STREAM_RETRYABLE_STATUS;
window.offlineGuard = offlineGuard;
window.sleepBackoff = sleepBackoff;
window.makeAIWatchdog = makeAIWatchdog;

/* ─── ui/usage.js ─── */
import { openUsageModal, closeUsageModal, loadUsageData, loadUsageMonth, showUsageTip, hideUsageTip } from './ui/usage.js';
window.openUsageModal = openUsageModal;
window.closeUsageModal = closeUsageModal;
/* Period tab inline onclick handlers (usage.js:138-139). */
window.loadUsageData = loadUsageData;
window.loadUsageMonth = loadUsageMonth;
/* Heatmap cell inline onmouseenter/onmouseleave handlers (usage.js:168). */
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
  openExamPanel, prepareExamView, openExamModal, closeExamView,
  toggleExamType, toggleExamModelMenu, selectExamModel,
  selectExamDifficulty, adjustExamCount,
  startExamGeneration, cancelExamGeneration,
  selectExamOpt,
  examNavJump, examNavStep,
  submitExam,
  renderExamForm,
  refreshExamI18n,
} from './exam.js';
window.renderExamForm = renderExamForm;
window.openExamPanel = openExamPanel;
window.prepareExamView = prepareExamView;
window.openExamModal = openExamModal;
window.closeExamView = closeExamView;
window.toggleExamType = toggleExamType;
window.toggleExamModelMenu = toggleExamModelMenu;
window.selectExamModel = selectExamModel;
window.selectExamDifficulty = selectExamDifficulty;
window.adjustExamCount = adjustExamCount;
window.startExamGeneration = startExamGeneration;
window.cancelExamGeneration = cancelExamGeneration;
window.selectExamOpt = selectExamOpt;
window.examNavJump = examNavJump;
window.examNavStep = examNavStep;
window.submitExam = submitExam;
window.refreshExamI18n = refreshExamI18n;

/* ─── ui/toolCards.js — needed by share.js to restore tool cards ─── */
import { appendToolModule, appendInlineArtifact } from './ui/toolCards.js';
window.appendToolModule = appendToolModule;
window.appendInlineArtifact = appendInlineArtifact;

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
   introduced. Defined inline here (the single window-bridge file) to
   keep them next to the other lightweight UI globals. ─── */

/* 撰写或编辑 — activate a dedicated Writing/Editing assistant by injecting
   a specialized system prompt for the turn (via setActiveTemplate, the
   same mechanism slash-command templates use). This replaces the old
   "prepend a scaffold string" behaviour with a real mode: the model
   commits to the writing-assistant role, the template-mode chip surfaces
   so the user can see (and dismiss) it, and the prompt scaffolds the
   available tools (web_search for fact-checking). */
var WRITE_EDIT_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
var WRITE_EDIT_SYSTEM_PROMPT =
  "You are an expert writing and editing assistant. Help the user compose, rewrite, or polish any text \u2014 essays, emails, posts, reports, documentation, scripts, or creative writing.\n\n" +
  "Workflow:\n" +
  "- If the request is clear, produce the writing directly.\n" +
  "- If a key detail is missing (audience, tone, length, format, or language), ask at most 2 focused questions first; otherwise proceed with sensible defaults.\n" +
  "- When editing text the user supplied, preserve their voice and intent. Return the revised version, and add a short bullet summary of substantive changes only when the edits are non-obvious or the user asked.\n\n" +
  "Tools:\n" +
  "- You may call the web_search tool to verify facts, gather current information, or find references when the writing depends on real-world accuracy. Cite sources briefly when you searched.\n\n" +
  "Output rules:\n" +
  "- Always match the user's language.\n" +
  "- Use Markdown for structure (headings, lists, short paragraphs) when the piece is long.\n" +
  "- Return the requested writing with minimal framing \u2014 no 'Here is your text:' preambles.";
window.composeAction = function () {
  var surface = getVisibleComposerSurface();
  var title = (typeof window.t === "function" && window.t("composer.write")) || "Write or edit";
  if (title === "composer.write") title = "Write or edit";
  if (typeof window.setActiveTemplate === "function") {
    window.setActiveTemplate({
      id: "tpl-write-edit",
      title: title,
      shortcut: "/write",
      icon: WRITE_EDIT_ICON,
      systemPrompt: WRITE_EDIT_SYSTEM_PROMPT,
      body: "",
      extensionKey: "write"
    });
  }
  focusComposer(surface);
  try {
    if (typeof window.updateStartBtn === "function") window.updateStartBtn();
    if (typeof window.updateSendBtn === "function") window.updateSendBtn();
  } catch (_) {}
};

var SOURCE_RESEARCH_SYSTEM_PROMPT =
  "You are in source-research mode. Turn the user's question into a focused evidence task.\n\n" +
  "Workflow:\n" +
  "1. Identify the exact claim, date range, geography, and decision the user needs.\n" +
  "2. Use the native web_search tool for current or externally verifiable facts. Prefer primary sources and independent corroboration.\n" +
  "3. Compare sources, call out disagreements, and separate verified facts from inference.\n" +
  "4. Return a concise synthesis with linked sources and a short 'What remains uncertain' note when material gaps remain.\n\n" +
  "Never invent citations or imitate tool-call JSON. If the request actually needs a broad multi-stage review, recommend Deep research rather than pretending one search is exhaustive.";

/* Find sources is a real evidence workflow, distinct from Deep research.
   It enables the native search capability (via the extensionKey side-effect
   on setActiveTemplate) and installs a visible mode whose system prompt
   controls source quality; it never auto-sends the draft. */
window.researchAction = function () {
  var surface = getVisibleComposerSurface();
  if (typeof window.setActiveTemplate === "function") {
    window.setActiveTemplate({
      id: "tpl-source-research",
      title: (typeof window.t === "function" ? window.t("composer.research") : "") || "Find sources",
      shortcut: "/research",
      icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
      systemPrompt: SOURCE_RESEARCH_SYSTEM_PROMPT,
      body: "",
      extensionKey: "webSearch"
    });
  }
  focusComposer(surface);
  if (typeof window.syncQuickChips === "function") window.syncQuickChips();
};

/* P_extension-chip — deep research is now a chip in the composer body
   (set via setActiveTemplate's extensionKey: "deepResearch"), not a
   separate hidden picker state. Re-clicking the + menu item while the
   chip is already active is a no-op (the extensionKey side-effect
   handler in main.js only flips when the key changes). Clicking the
   chip's × button clears both the chip and window.deepResearchOn so
   the next send goes through the normal chat / tutor pipeline. */
window.deepResearchAction = function () {
  var surface = getVisibleComposerSurface();
  var DEEP_RESEARCH_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21l6-3 6 3 6-3V3l-6 3-6-3-6 3z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>';
  if (typeof window.setActiveTemplate === "function") {
    window.setActiveTemplate({
      id: "tpl-deep-research",
      title: (typeof window.t === "function" ? window.t("composer.deepResearch") : "") || "Deep research",
      shortcut: "/research",
      icon: DEEP_RESEARCH_ICON,
      systemPrompt: "",
      body: "",
      extensionKey: "deepResearch"
    });
  }
  focusComposer(surface);
  if (typeof window.syncQuickChips === "function") window.syncQuickChips();
};

var DATA_ANALYSIS_SYSTEM_PROMPT =
  "You are in data-analysis mode. Treat attached files and pasted data as the working dataset.\n\n" +
  "Workflow:\n" +
  "1. Inspect schema, units, missing values, duplicates, and sampling limitations before drawing conclusions.\n" +
  "2. State the analysis question and choose the smallest valid method.\n" +
  "3. Use code_interpreter for non-trivial calculation, file analysis, or export; use render_visualization for a reader-facing chart after the numbers are validated.\n" +
  "4. Report the result, assumptions, checks, and material caveats. Include reproducible calculations and expose generated files as artifacts.\n\n" +
  "Never claim a computation ran unless a tool result confirms it. Do not infer columns or units that are not present.";

window.analyzeAction = function () {
  var surface = getVisibleComposerSurface();
  if (typeof window.setActiveTemplate === "function") {
    window.setActiveTemplate({
      id: "tpl-data-analysis",
      title: (typeof window.t === "function" ? window.t("composer.analyze") : "") || "Analyze data",
      shortcut: "/analyze",
      icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m4 7 6-4 6 7 5-4"/></svg>',
      systemPrompt: DATA_ANALYSIS_SYSTEM_PROMPT,
      body: "",
      extensionKey: "analyze"
    });
  }
  focusComposer(surface);
};

/* Explore is a full staged workflow (scope → search → integrate → deliver),
   not a one-shot prompt: it plans sub-questions, runs batched native
   web_search calls, reconciles the evidence, and produces a structured
   report as the product; when the user asks for a downloadable document,
   code_interpreter renders the file (e.g. a PDF) and exposes it as an
   artifact. Distinct from Deep research (autonomous agent) and Find
   sources (single evidence pass): Explore stays in the conversation and
   always ends in a reader-ready deliverable. */
var EXPLORE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>';
var EXPLORE_SYSTEM_PROMPT =
  "You are running the Explore workflow — a staged research system that turns an open question into a polished deliverable.\n\n" +
  "Stage 1 — Scope. In one short paragraph, restate the question precisely, list the 3-6 sub-questions that must be answered to cover it, and name the deliverable you will produce.\n\n" +
  "Stage 2 — Search. Answer each sub-question with native web_search calls: several targeted queries per sub-question (vary keywords; include the current year for anything time-sensitive), never one broad query for everything. Prefer primary sources and require two independent sources for every load-bearing claim.\n\n" +
  "Stage 3 — Integrate. Reconcile the evidence: note where sources disagree, separate verified fact from inference, and discard anything that cannot be attributed to a source.\n\n" +
  "Stage 4 — Deliver. Produce a structured report: title, short executive summary, one section per sub-question, a 'What remains uncertain' section, and a sources list. If the user asked for a downloadable document (PDF or similar), use code_interpreter to render the report into that file and expose it as an artifact; otherwise deliver the report directly in the chat.\n\n" +
  "Rules: never invent citations. If the topic genuinely needs more than about 10 searches, say so and propose splitting it. Keep intermediate commentary minimal — the report is the product.";
window.exploreAction = function () {
  var surface = getVisibleComposerSurface();
  if (typeof window.setActiveTemplate === "function") {
    window.setActiveTemplate({
      id: "tpl-explore",
      title: (typeof window.t === "function" ? window.t("composer.explore") : "") || "Explore",
      shortcut: "/explore",
      icon: EXPLORE_ICON,
      systemPrompt: EXPLORE_SYSTEM_PROMPT,
      body: "",
      extensionKey: "webSearch"
    });
  }
  focusComposer(surface);
  if (typeof window.syncQuickChips === "function") window.syncQuickChips();
};

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
window.setReasoningEffort = setReasoningEffort;
window.toggleEffortPicker = toggleEffortPicker;
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
window.savePromptTemplates = savePromptTemplates;
window.findTemplateByShortcut = findTemplateByShortcut;
window.upsertCustomTemplate = upsertCustomTemplate;
window.deleteCustomTemplate = deleteCustomTemplate;
