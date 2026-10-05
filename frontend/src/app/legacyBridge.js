import { updateSessionMetadata } from '../session/rowActions.js';
/* app/legacyBridge.js — extracted from main.js (B6 batch).
 * Legacy window bridges (window.X = X for inline handlers / cross-module
 * callers) + the typed window.__socratesLegacy gateway for React.
 * Zero-behavior-change lift. Imported once by main.js for side effects;
 * all entries resolve to direct imports (no window-read ordering hazards
 * except the documented optional surfaces that remain window.* reads).
 */
import { resendLastUserMessage, setChatStopState, handleSendClick, stopChatResponse } from '../chat/turnUi.js';
import { setCurrentUser, markAuthSuccess, isInAuthGraceWindow, clearPerUserClientState, toggleAppMode, resetApp, startNewChat, signOut, toggleIncognito } from './lifecycle.js';
import { getExplanation } from '../tutor/socraticTurn.js';
import { setActiveTemplate, clearActiveTemplate } from '../chat/templateSlash.js';
import { openTagEditor, closeTagEditor, onSessionDragStart, onSessionDragEnd, cycleActiveProject } from '../session/organize.js';
import { askChatTurn } from '../chat/turnController.js';
/* chat/streamingTurn.js (~65KB) is lazy — window.addStreamingMessage is
   an async proxy below; all call sites sit inside async send/restore
   paths and await the controller. */
import { syncSidebarBtns, toggleSidebarView } from '../ui/sidebarChrome.js';
import { loadSession } from '../session/loader.js';
import { toggleKBDetail } from '../ui/knowledgeDetail.js';
import { refreshApiConfig } from '../config/providers.js';
import { refreshServerSessions, retryRecentsFetch, actuallyDeleteSession, archiveSession, restoreSession, confirmPurgeSession, getArchivedSessions, flushRecentsReconcile } from '../session/recents.js';
import { renderRecents } from '../ui/recentsView.js';
import { openNav } from '../sidebar/navigation.service.ts';
import { closeConfirm, showConfirm } from '../ui/confirm.js';
import { deleteUserMessage, sendFeedback, restorePersistedMessageExtras } from '../ui/messageActions.ts';
import { buildAssistantHtml as renderAssistantHTML } from '../render/assistantHtml.ts';
import { showToast } from '../ui/toast.js';
import { addMessage } from '../chat/messages.js';
import { askNextQuestion } from '../tutor/socraticTurn.js';
import { saveCurrentSession } from '../session/persistence.js';
/* chat/webSearch.js (~16KB) is lazy — the window.fetchWebContext proxy
   below returns a promise, which every caller already awaits. */
import { openAttachmentPicker, openMediaPicker } from '../attachments/render.js';
import { getCustomInstructionsString, saveProfileName, onCustomInstructionsChange, toggleProfileWebSearch } from '../ui/profile.js';
import { editUserMessage, regenerateAssistantMessage, branchFromMessage } from '../chat/editBranch.js';
import { toggleReadAloud } from '../ui/readAloud.js';
import { selectShareVis, copyShareLink } from '../ui/share.js';
import { closeCheatsheet } from '../ui/cheatsheet.js';
import { toggleSidebar } from '../sidebar/sidebar.service.ts';
import { toggleDisplayPrefs } from '../displayPrefs.js';
import { openStorageModal, closeStorageModal } from '../ui/storage.js';
import { openPromptTemplatesModal, closePromptTemplatesModal } from '../ui/promptTemplates.js';
import { toggleExtensionByKey } from '../pickers.js';
import { openCmdKResult } from '../ui/cmdK.js';
/* ui/dangerConfirms.js is lazy — confirm actions import it on demand. */
import { processPendingMermaid, processPendingViz, reclaimVizCards, schedulePendingMermaid } from '../render/vizStubs.js';
import { wireCodeBlockHeaders, wireMsgBodyImages } from '../render/postRender.js';
import { mountVisualization, disposeVisualizations, disposeVisualization } from '../render/vizStubs.js';
import { appendInlineArtifact } from '../ui/toolCards.js';
import { formatMsgProgressive } from '../render/markdown.js';
import { stripCitationMarkers } from '../render/helpers.js';
import { stripChatArtifacts } from '../util/stripChatArtifacts.js';
import { publishThinkingPanelEvent } from '../ui/messageSnapshot.js';
import { retryLiveTurn, decideLiveApproval } from '../chat/liveTurn.js';
import { startSession } from '../chat/sessionBootstrap.js';
import { submitChatMessage } from '../chat/sendPipeline.js';
import { setRecentsSearch } from '../ui/recentsView.js';
import { syncEffortUI } from '../ui/effortPicker.js';

/* Diagnostic entry points (noop until startSession installs per-session closures). */
window.cancelDiagnostic = function () {};
window.retryDiagnostic = function () {};
window.useBuiltinDiagnostic = function () {};

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
var _webSearchImport = null;
function _loadWebSearch() {
  if (!_webSearchImport) {
    _webSearchImport = import('../chat/webSearch.js');
    _webSearchImport.catch(function (err) {
      _webSearchImport = null;
      console.error('[webSearch] failed to load', err);
    });
  }
  return _webSearchImport;
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
  return _loadWebSearch().then(function (m) { return m.fetchWebContext(query, opts); });
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

window.__socratesLegacy = {
  messages: {
    editUserMessage: window.editUserMessage,
    regenerateAssistantMessage: window.regenerateAssistantMessage,
    deleteUserMessage: window.deleteUserMessage,
    branchFromMessage: window.branchFromMessage,
    sendFeedback: window.sendFeedback,
    toggleReadAloud: toggleReadAloud,
    openShareModal: window.openShareModal,
    showToast: window.showToast,
  },
  navigation: {
    resetApp: window.resetApp,
    startNewChat: window.startNewChat,
    toggleSidebar,
    openNav,
    openSettings: window.openSettings,
    closeSettings: window.closeSettings,
    openProfile: window.openProfile,
    closeProfile: window.closeProfile,
    openUsageModal: window.openUsageModal,
    closeUsageModal: window.closeUsageModal,
    openStorageModal: openStorageModal,
    closeStorageModal: closeStorageModal,
    openPromptTemplatesModal: openPromptTemplatesModal,
    closePromptTemplatesModal: closePromptTemplatesModal,
    openCheatsheet: window.openCheatsheet,
    closeCheatsheet: closeCheatsheet,
    closeMorePopover: window.closeMorePopover,
    toggleDisplayPrefs: toggleDisplayPrefs,
    toggleIncognito: toggleIncognito,
    signOut: signOut,
  },
  confirm: {
    closeConfirm,
    showConfirm,
  },
  sessions: {
    flushRecentsReconcile,
    updateSessionMetadata,
    loadSession,
    setRecentsSearch: setRecentsSearch,
    retryRecentsFetch: retryRecentsFetch,
    openTagEditor: openTagEditor,
    deleteSession: actuallyDeleteSession,
    archiveSession: archiveSession,
    onSessionDragStart: onSessionDragStart,
    onSessionDragEnd: onSessionDragEnd,
    restoreSession: restoreSession,
    confirmPurgeSession: confirmPurgeSession,
  },
  composer: {
    openAttachmentPicker: window.openAttachmentPicker,
    openMediaPicker: window.openMediaPicker,
    toggleWebSearch: window.toggleWebSearch,
    exploreAction: window.exploreAction,
    toggleTools: window.toggleComposerTools,
    composeAction: window.composeAction,
    researchAction: window.researchAction,
    deepResearchAction: window.deepResearchAction,
    analyzeAction: window.analyzeAction,
    toggleExtensionByKey: toggleExtensionByKey,
    removeAttachment: window.removeAttachment,
    retryAttachment: window.retryComposerAttachment,
    renderAttachmentChips: window.renderAttachmentChips,
    startSession: startSession,
    submitChatMessage: submitChatMessage,
    stopChatResponse: stopChatResponse,
    syncEffortUI: syncEffortUI,
  },
  cmdK: {
    openCmdK: window.openCmdK,
    closeCmdK: window.closeCmdK,
    onCmdKInput: window.onCmdKInput,
    onCmdKKey: window.onCmdKKey,
    openCmdKResult: openCmdKResult,
  },
  share: {
    selectShareVis: selectShareVis,
    createShareLink: window.createShareLink,
    copyShareLink: copyShareLink,
    revokeShareLink: window.revokeShareLink,
    closeShareModal: window.closeShareModal,
  },
  profile: {
    saveProfileName: saveProfileName,
    onCustomInstructionsChange: onCustomInstructionsChange,
    toggleProfileWebSearch: toggleProfileWebSearch,
    confirmClearCache: function () { return _loadDangerConfirms().then(function (m) { return m.confirmClearCache(); }); },
    confirmClearSettings: function () { return _loadDangerConfirms().then(function (m) { return m.confirmClearSettings(); }); },
    confirmDeleteAccount: function () { return _loadDangerConfirms().then(function (m) { return m.confirmDeleteAccount(); }); },
    setLang: window.setLang,
  },
  postRender: {
    processPendingMermaid: processPendingMermaid,
    schedulePendingMermaid: schedulePendingMermaid,
    processPendingViz: processPendingViz,
    reclaimVizCards: reclaimVizCards,
    processPendingVizActions: window.processPendingVizActions,
    wireCodeBlockHeaders: wireCodeBlockHeaders,
    wireMsgBodyImages: wireMsgBodyImages,
    restorePersistedMessageExtras: window.restorePersistedMessageExtras,
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
       uses it for a live turn and renderAssistantHTML once the turn settles,
       which is the same hand-off the legacy pipeline did at finish(). */
    renderAssistantProgressive: function (rawText, opts) {
      /* P_strip-citations — same body contract as renderAssistantHTML, so a
         marker never flashes in the live tail and then vanishes at finish.
         `opts.complete` marks text that can no longer grow (a settled
         block): it renders exactly as renderAssistantHTML will at finish. */
      return formatMsgProgressive(stripCitationMarkers(stripChatArtifacts(String(rawText || ''))), opts);
    },
  },
  /* P_react-live-turn — the two surfaces a declarative turn has to hand back:
     the reasoning panel (the status line is clickable, but the panel is a
     drawer React does not own) and the live turn's controls. Both are thin
     routes into the streaming closure; see the registries above
     addStreamingMessage for why the closure, not the row, has to act. */
  thinking: {
    openPanel: function (messageId) {
      publishThinkingPanelEvent({ type: "panel-open", messageId: messageId || null });
    },
  },
  liveTurn: {
    retry: function (messageId) {
      return retryLiveTurn(messageId);
    },
    decideApproval: function (messageId, toolCallId, decision) {
      return decideLiveApproval(messageId, toolCallId, decision);
    },
  },
};
