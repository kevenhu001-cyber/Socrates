import { updateSessionMetadata } from '../session/rowActions.ts';
/* app/legacyBridge.ts — extracted from main.js (B6 batch).
 * Legacy window bridges (window.X = X for inline handlers / cross-module
 * callers) + the typed window.__socratesLegacy gateway for React.
 * Zero-behavior-change lift. Imported once by main.js for side effects;
 * all entries resolve to direct imports (no window-read ordering hazards
 * except the documented optional surfaces that remain window.* reads).
 */
import { resendLastUserMessage, setChatStopState, handleSendClick, stopChatResponse } from '../chat/turnUi.ts';
import { setCurrentUser, markAuthSuccess, isInAuthGraceWindow, clearPerUserClientState, toggleAppMode, resetApp, startNewChat, signOut, toggleIncognito } from './lifecycle.ts';
import { setActiveTemplate, clearActiveTemplate } from '../chat/templateSlash.ts';
import { openTagEditor, closeTagEditor, onSessionDragStart, onSessionDragEnd } from '../session/organizeRuntime.ts';
import { askChatTurn } from '../chat/turnController.js';
/* chat/streamingTurn.ts (~65KB) is lazy — window.addStreamingMessage is
   an async proxy below; all call sites sit inside async send/restore
   paths and await the controller. */
import { syncSidebarBtns, toggleSidebarView } from '../ui/sidebarChrome.ts';
import { loadSession } from '../session/loader.ts';
import { toggleKBDetail } from '../ui/knowledgeDetail.ts';
import { updateKB } from '../ui/knowledgePanel.ts';
import { refreshServerSessions, retryRecentsFetch, actuallyDeleteSession, archiveSession, restoreSession, confirmPurgeSession, getArchivedSessions, flushRecentsReconcile } from '../session/recents.ts';
import { renderRecents } from '../ui/recentsView.ts';
import { openNav } from '../sidebar/navigation.service.ts';
import { closeConfirm, showConfirm } from '../ui/confirm.js';
import { deleteUserMessage, sendFeedback, restorePersistedMessageExtras } from '../ui/messageActions.ts';
import { buildAssistantHtml as renderAssistantHTML } from '../render/assistantHtml.ts';
import { showToast } from '../ui/toast.ts';
import { addMessage } from '../chat/messages.ts';
import { askNextQuestion } from '../tutor/socraticTurn.ts';
import { saveCurrentSession } from '../session/persistence.ts';
/* chat/webSearch.ts (~16KB) is lazy — the window.fetchWebContext proxy
   below returns a promise, which every caller already awaits. */
import { openAttachmentPicker, openMediaPicker, renderAttachmentChips, retryComposerAttachment } from '../attachments/render.ts';
import { removeAttachment } from '../attachments.ts';
import { saveProfileName, onCustomInstructionsChange, toggleProfileWebSearch, openProfile, closeProfile } from '../ui/profile.ts';
import { editUserMessage, regenerateAssistantMessage, branchFromMessage, switchMessageBranch } from '../chat/editBranch.ts';
import { toggleReadAloud } from '../ui/readAloud.ts';
import { selectShareVis, copyShareLink, openShareModal, closeShareModal, createShareLink, revokeShareLink } from '../ui/share.ts';
import { openCheatsheet, closeCheatsheet } from '../ui/cheatsheet.js';
import { closeMorePopover } from '../sidebar/morePopover.ts';
import { toggleComposerTools } from '../ui/composerTools.ts';
import { composeAction, researchAction, exploreAction, deepResearchAction, analyzeAction } from '../extensions/index.ts';
import { toggleSidebar } from '../sidebar/sidebar.service.ts';
import { toggleDisplayPrefs } from '../displayPrefs.ts';
import { openStorageModal, closeStorageModal } from '../ui/storage.js';
import { openPromptTemplatesModal, closePromptTemplatesModal } from '../ui/promptTemplates.ts';
import { toggleExtensionByKey, toggleWebSearch } from '../pickers.ts';
import { openCmdK, closeCmdK, onCmdKInput, onCmdKKey, openCmdKResult } from '../ui/cmdK.ts';
import { loadWebSearch } from '../chat/webSearchLoader.ts';
/* ui/dangerConfirms.js is lazy — confirm actions import it on demand. */
import { processPendingMermaid, processPendingViz, reclaimVizCards, schedulePendingMermaid, processPendingVizActions } from '../render/vizStubs.ts';
import { wireCodeBlockHeaders, wireMsgBodyImages } from '../render/postRender.ts';
import { mountVisualization, disposeVisualizations, disposeVisualization } from '../render/vizStubs.ts';
import { appendInlineArtifact, appendToolModule } from '../ui/toolCards.ts';
import { formatMsgProgressive } from '../render/markdown.ts';
import { stripCitationMarkers } from '../render/helpers.ts';
import { stripChatArtifacts } from '../util/stripChatArtifacts.ts';
import { retryLiveTurn, decideLiveApproval } from '../chat/liveTurn.ts';
import { startSession } from '../chat/sessionBootstrap.ts';
import { submitChatMessage } from '../chat/sendPipeline.ts';
import { setRecentsSearch } from '../ui/recentsView.ts';
import { syncEffortUI } from '../ui/effortPicker.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


browserWindow.setActiveTemplate = setActiveTemplate;
browserWindow.clearActiveTemplate = clearActiveTemplate;
browserWindow.closeTagEditor = closeTagEditor;
browserWindow.askChatTurn = askChatTurn;
/* Warm path returns the controller synchronously — callers that read
   state.messages right after askChatTurn() (the placeholder is pushed
   inside addStreamingMessage) depend on it. The cold path returns a
   Promise; every internal call site awaits either way. */
browserWindow.__loadStreamingTurn = _loadStreamingTurn;
type StreamingTurnModule = typeof import('../chat/streamingTurn.ts');
browserWindow.addStreamingMessage = function (opts: Parameters<StreamingTurnModule['addStreamingMessage']>[0]) {
  if (_streamingModule) return _streamingModule.addStreamingMessage(opts);
  return _loadStreamingTurn().then(function (m) { return m.addStreamingMessage(opts); });
};
browserWindow.syncSidebarBtns = syncSidebarBtns;
browserWindow.toggleSidebarView = toggleSidebarView;
browserWindow.loadSession = loadSession;
browserWindow.toggleKBDetail = toggleKBDetail;
browserWindow.refreshServerSessions = refreshServerSessions;
browserWindow.renderRecents = renderRecents;
browserWindow.resendLastUserMessage = resendLastUserMessage;
browserWindow.setChatStopState = setChatStopState;
browserWindow.handleSendClick = handleSendClick;
let _streamingImport: Promise<StreamingTurnModule> | null = null;
let _streamingModule: StreamingTurnModule | null = null;
function _loadStreamingTurn() {
  if (!_streamingImport) {
    _streamingImport = import('../chat/streamingTurn.ts');
    _streamingImport.then(function (m) { _streamingModule = m; });
    _streamingImport.catch(function (err) {
      _streamingImport = null;
      console.error('[stream] failed to load', err);
    });
  }
  return _streamingImport;
}
type DangerConfirmsModule = typeof import('../ui/dangerConfirms.js');
let _dangerImport: Promise<DangerConfirmsModule> | null = null;
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

browserWindow.setCurrentUser = setCurrentUser;
browserWindow.markAuthSuccess = markAuthSuccess;
browserWindow.isInAuthGraceWindow = isInAuthGraceWindow;
browserWindow.clearPerUserClientState = clearPerUserClientState;
browserWindow.toggleAppMode = toggleAppMode;
browserWindow.addMessage = addMessage;
browserWindow.askNextQuestion = askNextQuestion;
browserWindow.saveCurrentSession = saveCurrentSession;
browserWindow.fetchWebContext = function (
  query: Parameters<typeof import('../chat/webSearch.ts')['fetchWebContext']>[0],
  opts?: Parameters<typeof import('../chat/webSearch.ts')['fetchWebContext']>[1],
) {
  return loadWebSearch().then(function (m) { return m.fetchWebContext(query, opts); });
};
browserWindow.openAttachmentPicker = openAttachmentPicker;
browserWindow.renderAssistantHTML = renderAssistantHTML;
browserWindow.showToast = showToast;
browserWindow.resetApp = resetApp;
browserWindow.startNewChat = startNewChat;
browserWindow.startSession = startSession;
browserWindow.submitChatMessage = submitChatMessage;

browserWindow.__socratesLegacy = {
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
      if (typeof browserWindow.openSettings === 'function') return browserWindow.openSettings();
      return import('../react/settings/settings.service.ts').then(function (m) { return m.openSettings(); });
    },
    closeSettings: function () {
      if (typeof browserWindow.closeSettings === 'function') return browserWindow.closeSettings();
      return import('../react/settings/settings.service.ts').then(function (m) { return m.closeSettings(); });
    },
    openProfile,
    closeProfile,
    openUsageModal: function () {
      if (typeof browserWindow.openUsageModal === 'function') return browserWindow.openUsageModal();
      return import('../ui/usage.ts').then(function (m) { return m.openUsageModal(); });
    },
    closeUsageModal: function () {
      if (typeof browserWindow.closeUsageModal === 'function') return browserWindow.closeUsageModal();
      return import('../ui/usage.ts').then(function (m) { return m.closeUsageModal(); });
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
  knowledge: {
    update: updateKB,
  },
  sessions: {
    flushRecentsReconcile,
    getArchivedSessions,
    updateSessionMetadata,
    loadSession,
    setRecentsSearch,
    retryRecentsFetch,
    openTagEditor: (sessionId, event) => openTagEditor(sessionId, event ? {
      stopPropagation: () => event.stopPropagation(),
      preventDefault: () => event.preventDefault(),
      currentTarget: event.currentTarget instanceof Element ? event.currentTarget : null,
    } : null),
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
    setLang: browserWindow.setLang,
  },
  postRender: {
    appendToolModule,
    processPendingMermaid,
    schedulePendingMermaid: () => schedulePendingMermaid(),
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
    disposeVisualization: function (card: Parameters<typeof disposeVisualization>[0]) {
      if (typeof disposeVisualization === 'function') disposeVisualization(card);
    },
    appendInlineArtifact: function (fileId, mimeType, outEl, displayName) {
      if (typeof appendInlineArtifact === 'function') {
        appendInlineArtifact(fileId, mimeType || 'application/octet-stream', outEl, displayName);
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
      return decideLiveApproval(messageId, toolCallId, decision) ?? undefined;
    },
  },
};
