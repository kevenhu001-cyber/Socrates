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
import { openVizModal } from './render/viz.js';
window.__vizOpenModal = openVizModal;

/* ─── render/markdown.js ─── */
import { stripMarkdown, findLastUserMessage } from './render/markdown.js';
window.stripMarkdown = stripMarkdown;
window.findLastUserMessage = findLastUserMessage;

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
import { closeCheatsheet } from './ui/cheatsheet.js';
window.closeCheatsheet = closeCheatsheet;

/* ─── ui/confirm.js ─── */
import { closeConfirm } from './ui/confirm.js';
window.closeConfirm = closeConfirm;

/* ─── ui/cmdK.js ─── */
import { closeCmdK, onCmdKInput, onCmdKKey, openCmdK, rebuildCmdKIndex } from './ui/cmdK.js';
window.closeCmdK = closeCmdK;
window.onCmdKInput = onCmdKInput;
window.onCmdKKey = onCmdKKey;

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
import { openSettings, closeSettings, toggleAPI, syncSettingsUI, renderProviderList, addProvider, removeProvider, setActiveProvider, updateProviderField, saveSettings, clearSettings } from './ui/settings.js';
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.toggleAPI = toggleAPI;
window.addProvider = addProvider;
window.removeProvider = removeProvider;
window.setActiveProvider = setActiveProvider;
window.updateProviderField = updateProviderField;
window.saveSettings = saveSettings;
window.clearSettings = clearSettings;

/* ─── ui/dangerConfirms.js ─── */
import { confirmClearCache, confirmClearSettings, confirmDeleteAccount } from './ui/dangerConfirms.js';
window.confirmClearCache = confirmClearCache;
window.confirmClearSettings = confirmClearSettings;
window.confirmDeleteAccount = confirmDeleteAccount;

/* ─── ui/profile.js ─── */
import { closeProfile, onCustomInstructionsChange, toggleProfileWebSearch, renderUserFooter, openProfile } from './ui/profile.js';
window.closeProfile = closeProfile;
window.onCustomInstructionsChange = onCustomInstructionsChange;
window.toggleProfileWebSearch = toggleProfileWebSearch;
window.renderUserFooter = renderUserFooter;
window.openProfile = openProfile;

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
  renderExamForm, toggleExamType,
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