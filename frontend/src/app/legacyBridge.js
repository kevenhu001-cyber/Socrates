import { updateSessionMetadata } from '../session/rowActions.ts';
/* app/legacyBridge.js — extracted from main.js (B6 batch).
 * Legacy window bridges (window.X = X for inline handlers / cross-module
 * callers) + the typed window.__socratesLegacy gateway for React.
 * Zero-behavior-change lift. Imported once by main.js for side effects;
 * all entries resolve to direct imports (no window-read ordering hazards
 * except the documented optional surfaces that remain window.* reads).
 */
import { resendLastUserMessage, setChatStopState, handleSendClick, stopChatResponse } from '../chat/turnUi.ts';
import { setCurrentUser, markAuthSuccess, isInAuthGraceWindow, clearPerUserClientState, toggleAppMode, resetApp, startNewChat, signOut, toggleIncognito } from './lifecycle.js';
import { getExplanation } from '../tutor/socraticTurn.js';
import { setActiveTemplate, clearActiveTemplate } from '../chat/templateSlash.js';
import { openTagEditor, closeTagEditor, onSessionDragStart, onSessionDragEnd, cycleActiveProject } from '../session/organizeRuntime.ts';
import { askChatTurn } from '../chat/turnController.js';
/* chat/streamingTurn.js (~65KB) is lazy — window.addStreamingMessage is
   an async proxy below; all call sites sit inside async send/restore
   paths and await the controller. */
import { syncSidebarBtns, toggleSidebarView } from '../ui/sidebarChrome.js';
import { loadSession } from '../session/loader.ts';
import { toggleKBDetail } from '../ui/knowledgeDetail.js';
import { refreshApiConfig } from '../config/providers.ts';
import { refreshServerSessions, retryRecentsFetch, actuallyDeleteSession, archiveSession, restoreSession, confirmPurgeSession, getArchivedSessions, flushRecentsReconcile } from '../session/recents.ts';
import { renderRecents } from '../ui/recentsView.js';
import { openNav } from '../sidebar/navigation.service.ts';
import { closeConfirm, showConfirm } from '../ui/confirm.js';
import { deleteUserMessage, sendFeedback, restorePersistedMessageExtras } from '../ui/messageActions.ts';
import { buildAssistantHtml as renderAssistantHTML } from '../render/assistantHtml.ts';
import { showToast } from '../ui/toast.ts';
import { addMessage } from '../chat/messages.ts';
import { askNextQuestion } from '../tutor/socraticTurn.js';
import { saveCurrentSession } from '../session/persistence.ts';
/* chat/webSearch.js (~16KB) is lazy — the window.fetchWebContext proxy
   below returns a promise, which every caller already awaits. */
import { openAttachmentPicker, openMediaPicker, renderAttachmentChips, retryComposerAttachment } from '../attachments/render.js';
import { removeAttachment } from '../attachments.js';
import { getCustomInstructionsString, saveProfileName, onCustomInstructionsChange, toggleProfileWebSearch, openProfile, closeProfile } from '../ui/profile.js';
import { editUserMessage, regenerateAssistantMessage, branchFromMessage, switchMessageBranch } from '../chat/editBranch.js';
import { toggleReadAloud } from '../ui/readAloud.js';
import { selectShareVis, copyShareLink, openShareModal, closeShareModal, createShareLink, revokeShareLink } from '../ui/share.js';
import { openCheatsheet, closeCheatsheet } from '../ui/cheatsheet.js';
import { closeMorePopover } from '../sidebar/morePopover.js';
import { toggleComposerTools } from '../ui/composerTools.js';
import { composeAction, researchAction, exploreAction, deepResearchAction, analyzeAction } from '../extensions/index.ts';
import { toggleSidebar } from '../sidebar/sidebar.service.ts';
import { toggleDisplayPrefs } from '../displayPrefs.js';
import { openStorageModal, closeStorageModal } from '../ui/storage.js';
import { openPromptTemplatesModal, closePromptTemplatesModal } from '../ui/promptTemplates.js';
import { toggleExtensionByKey, toggleWebSearch } from '../pickers.js';
import { openCmdK, closeCmdK, onCmdKInput, onCmdKKey, openCmdKResult } from '../ui/cmdK.js';
import { loadWebSearch } from '../chat/webSearchLoader.ts';
/* ui/dangerConfirms.js is lazy — confirm actions import it on demand. */
import { processPendingMermaid, processPendingViz, reclaimVizCards, schedulePendingMermaid, processPendingVizActions } from '../render/vizStubs.js';
import { wireCodeBlockHeaders, wireMsgBodyImages } from '../render/postRender.ts';
import { mountVisualization, disposeVisualizations, disposeVisualization } from '../render/vizStubs.js';
import { appendInlineArtifact } from '../ui/toolCards.js';
import { formatMsgProgressive } from '../render/markdown.ts';
import { stripCitationMarkers } from '../render/helpers.ts';
import { stripChatArtifacts } from '../util/stripChatArtifacts.ts';
import { retryLiveTurn, decideLiveApproval } from '../chat/liveTurn.ts';
import { startSession } from '../chat/sessionBootstrap.ts';
import { submitChatMessage } from '../chat/sendPipeline.ts';
import { setRecentsSearch } from '../ui/recentsView.js';
import { syncEffortUI } from '../ui/effortPicker.js';

/* Diagnostic entry points (noop until startSession installs per-session closures). */
window.cancelDiagnostic = function () { /* noop */ };
window.retryDiagnostic = function () { /* noop */ };
window.useBuiltinDiagnostic = function () { /* noop */ };

/* No max_tokens cap — backend defaults to its model max when omitted. */
var MAX_TOKENS_CHAT = undefined;
window.MAX_TOKENS_CHAT = MAX_TOKENS_CHAT;

window.getExplanation = getExplanation;
window.setActiveTemplate = setActiveTemplate;
window.clearActiveTemplate = clearActiveTemplate;
window.closeTagEditor = closeTagEditor;
window.askChatTurn = askChatTurn;
/* Warm path returns the controller synchronously — callers that read
   state.messages right after askChatTurn() (the placeholder is pushed
   inside addStreamingMessage) depend on it. The cold path returns a
   Promise; every internal call site awaits either way. */
window.__loadStreamingTurn = _loadStreamingTurn;
window.addStreamingMessage = function (opts) {
  if (_streamingModule) return _streamingModule.addStreamingMessage(opts);
  return _loadStreamingTurn().then(function (m) { return m.addStreamingMessage(opts); });
};
window.syncSidebarBtns = syncSidebarBtns;
window.toggleSidebarView = toggleSidebarView;
window.loadSession = loadSession;
window.toggleKBDetail = toggleKBDetail;
window.refreshServerSessions = refreshServerSessions;
window.refreshApiConfig = refreshApiConfig;
window.renderRecents = renderRecents;
window.resendLastUserMessage = resendLastUserMessage;
window.setChatStopState = setChatStopState;
window.handleSendClick = handleSendClick;
var _streamingImport = null;
var _streamingModule = null;
function _loadStreamingTurn() {
  if (!_streamingImport) {
    _streamingImport = import('../chat/streamingTurn.js');
    _streamingImport.then(function (m) { _streamingModule = m; });
    _streamingImport.catch(function (err) {
      _streamingImport = null;
      console.error('[stream] failed to load', err);
    });
  }
  return _streamingImport;
}
var _dangerImport = null;
function _loadDangerConfirms() {
  if (!_dangerImport) {
    _dangerImport = import('../ui/dangerConfirms.js');
    _dangerImport.catch(function (err) {
      _dangerImport = null;
      console.error('[dangerConfirms] failed to load', err);
    });
  }
  return _dangerImport;
}

window.setCurrentUser = setCurrentUser;
window.markAuthSuccess = markAuthSuccess;
window.isInAuthGraceWindow = isInAuthGraceWindow;
window.clearPerUserClientState = clearPerUserClientState;
window.toggleAppMode = toggleAppMode;
window.addMessage = addMessage;
window.askNextQuestion = askNextQuestion;
window.saveCurrentSession = saveCurrentSession;
window.fetchWebContext = function (query, opts) {
  return loadWebSearch().then(function (m) { return m.fetchWebContext(query, opts); });
};
window.openAttachmentPicker = openAttachmentPicker;
window.openMediaPicker = openMediaPicker;
window.getArchivedSessions = getArchivedSessions;
window.getCustomInstructionsString = getCustomInstructionsString;
window.editUserMessage = editUserMessage;
window.deleteUserMessage = deleteUserMessage;
window.regenerateAssistantMessage = regenerateAssistantMessage;
window.branchFromMessage = branchFromMessage;
window.sendFeedback = sendFeedback;
window.restorePersistedMessageExtras = restorePersistedMessageExtras;
window.renderAssistantHTML = renderAssistantHTML;
window.showToast = showToast;
window.resetApp = resetApp;
window.startNewChat = startNewChat;
window.startSession = startSession;
window.submitChatMessage = submitChatMessage;
window.cycleActiveProject = cycleActiveProject;
window.stopChatResponse = stopChatResponse;
window.switchMessageBranch = switchMessageBranch;

window.__socratesLegacy = {
  messages: {
    editUserMessage,
    regenerateAssistantMessage,
    switchMessageBranch,
    deleteUserMessage,
    branchFromMessage,
    sendFeedback,
    toggleReadAloud,
    openShareModal,
    showToast,
  },
  navigation: {
    resetApp,
    startNewChat,
    toggleSidebar,
    openNav,
    openSettings: function () {
      if (typeof window.openSettings === 'function') return window.openSettings();
      return import('../react/settings/settings.service.ts').then(function (m) { return m.openSettings(); });
    },
    closeSettings: function () {
      if (typeof window.closeSettings === 'function') return window.closeSettings();
      return import('../react/settings/settings.service.ts').then(function (m) { return m.closeSettings(); });
    },
    openProfile,
    closeProfile,
    openUsageModal: function () {
      if (typeof window.openUsageModal === 'function') return window.openUsageModal();
      return import('../ui/usage.js').then(function (m) { return m.openUsageModal(); });
    },
    closeUsageModal: function () {
      if (typeof window.closeUsageModal === 'function') return window.closeUsageModal();
      return import('../ui/usage.js').then(function (m) { return m.closeUsageModal(); });
    },
    openStorageModal,
    closeStorageModal,
    openPromptTemplatesModal,
    closePromptTemplatesModal,
    openCheatsheet,
    closeCheatsheet,
    closeMorePopover,
    toggleDisplayPrefs,
    toggleIncognito,
    signOut,
  },
  confirm: {
    closeConfirm,
    showConfirm,
  },
  sessions: {
    flushRecentsReconcile,
    updateSessionMetadata,
    loadSession,
    setRecentsSearch,
    retryRecentsFetch,
    openTagEditor,
    deleteSession: actuallyDeleteSession,
    archiveSession,
    onSessionDragStart,
    onSessionDragEnd,
    restoreSession,
    confirmPurgeSession,
  },
  composer: {
    openAttachmentPicker,
    openMediaPicker,
    toggleWebSearch,
    exploreAction,
    toggleTools: toggleComposerTools,
    composeAction,
    researchAction,
    deepResearchAction,
    analyzeAction,
    toggleExtensionByKey,
    removeAttachment,
    retryAttachment: retryComposerAttachment,
    renderAttachmentChips,
    startSession,
    submitChatMessage,
    stopChatResponse,
    syncEffortUI,
  },
  cmdK: {
    openCmdK,
    closeCmdK,
    onCmdKInput,
    onCmdKKey,
    openCmdKResult,
  },
  share: {
    selectShareVis,
    createShareLink,
    copyShareLink,
    revokeShareLink,
    closeShareModal,
  },
  profile: {
    saveProfileName,
    onCustomInstructionsChange,
    toggleProfileWebSearch,
    confirmClearCache: function () { return _loadDangerConfirms().then(function (m) { return m.confirmClearCache(); }); },
    confirmClearSettings: function () { return _loadDangerConfirms().then(function (m) { return m.confirmClearSettings(); }); },
    confirmDeleteAccount: function () { return _loadDangerConfirms().then(function (m) { return m.confirmDeleteAccount(); }); },
    setLang: window.setLang,
  },
  postRender: {
    processPendingMermaid,
    schedulePendingMermaid,
    processPendingViz,
    reclaimVizCards,
    processPendingVizActions,
    wireCodeBlockHeaders,
    wireMsgBodyImages,
    restorePersistedMessageExtras,
    /* P_declarative-tool-run — react/tool-run renders a tool row's non-text
       output (chart spec, saved files) from toolCalls[] instead of having
       restorePersistedMessageExtras insert a sibling node after the row. Both
       mounters dedup by id, so the two paths sharing one host is harmless. */
    mountVisualization: function (spec, host, options) {
      return typeof mountVisualization === 'function'
        ? mountVisualization(spec, host, options) : null;
    },
    /* React host teardown: dispose every card (and its renderer resources)
       in the host when the owning component unmounts or remounts. */
    disposeVisualizations: function (host) {
      if (typeof disposeVisualizations === 'function') disposeVisualizations(host);
    },
    /* Teardown for one card React captured from mountVisualization's return
       value — survives a host the legacy pipeline emptied first. */
    disposeVisualization: function (card) {
      if (typeof disposeVisualization === 'function') disposeVisualization(card);
    },
    appendInlineArtifact: function (fileId, mimeType, outEl, displayName) {
      if (typeof appendInlineArtifact === 'function') {
        appendInlineArtifact(fileId, mimeType, outEl, displayName);
      }
    },
  },
  /* P_declarative-tool-run — markdown rendering stays in legacy (it owns the
     viz/mermaid placeholder registration that postRender fills in), but the
     tool rows no longer do: react/tool-run renders those from toolCalls[].
     AssistantTurn calls renderAssistantHTML per prose segment, so the answer
     text keeps formatting exactly as before. */
  render: {
    renderAssistantHTML: function (rawText) { return renderAssistantHTML(rawText); },
    /* P_tool-live-turn — the streaming-safe renderer, same one the old
       imperative doRender painted with. formatMsg assumes closed pairs, so
       feeding it a half-arrived `$$…$$` or an open fence leaks raw LaTeX into
       the bubble; this preprocessor tolerates partial input. AssistantTurn
       keeps this renderer for the lifetime of a streamed turn, including finish. */
    renderAssistantProgressive: function (rawText, opts) {
      /* P_strip-citations — same body contract as renderAssistantHTML, so a
         marker never flashes in the live tail and then vanishes at finish.
         `opts.complete` marks text that can no longer grow (a settled
         block): it renders exactly as renderAssistantHTML will at finish. */
      return formatMsgProgressive(stripCitationMarkers(stripChatArtifacts(String(rawText || ''))), opts);
    },
  },
  /* Live controls remain owned by the streaming pipeline. */
  liveTurn: {
    retry: function (messageId) {
      return retryLiveTurn(messageId);
    },
    decideApproval: function (messageId, toolCallId, decision) {
      return decideLiveApproval(messageId, toolCallId, decision);
    },
  },
};
