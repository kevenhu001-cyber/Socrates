/* app/legacyBridge.js — extracted from main.js (B6 batch).
 * Legacy window bridges (window.X = X for inline handlers / cross-module
 * callers) + the typed window.__socratesLegacy gateway for React.
 * Zero-behavior-change lift. Imported once by main.js for side effects;
 * all entries resolve to direct imports (no window-read ordering hazards
 * except the documented optional surfaces that remain window.* reads).
 */
import { resendLastUserMessage, setChatStopState, handleSendClick, stopChatResponse } from '../chat/turnUi.js';
import { setCurrentUser, markAuthSuccess, isInAuthGraceWindow, clearPerUserClientState, toggleAppMode, updateModeBadge, resetApp, signOut } from './lifecycle.js';
import { getExplanation } from '../tutor/socraticTurn.js';
import { setActiveTemplate, clearActiveTemplate } from '../chat/templateSlash.js';
import { openTagEditor, closeTagEditor, onSessionDragStart, onSessionDragEnd, cycleActiveProject } from '../session/organize.js';
import { askChatTurn } from '../chat/turnController.js';
import { addStreamingMessage } from '../chat/streamingTurn.js';
import { syncSidebarBtns, toggleSidebarView } from '../ui/sidebarChrome.js';
import { loadSession } from '../session/loader.js';
import { toggleKBDetail } from '../ui/knowledgeDetail.js';
import { refreshApiConfig } from '../config/providers.js';
import { refreshServerSessions, retryRecentsFetch, actuallyDeleteSession, restoreSession, confirmPurgeSession, getArchivedSessions } from '../session/recents.js';
import { renderRecents } from '../ui/recentsView.js';
import { deleteUserMessage, sendFeedback, restorePersistedMessageExtras } from '../ui/messageActions.ts';
import { buildAssistantHtml as renderAssistantHTML } from '../render/assistantHtml.ts';
import { showToast } from '../ui/toast.js';
import { addMessage } from '../chat/messages.js';
import { askNextQuestion } from '../tutor/socraticTurn.js';
import { saveCurrentSession } from '../session/persistence.js';
import { fetchWebContext } from '../chat/webSearch.js';
import { openAttachmentPicker } from '../attachments/render.js';
import { getCustomInstructionsString, saveProfileName, onCustomInstructionsChange, toggleProfileWebSearch } from '../ui/profile.js';
import { editUserMessage, regenerateAssistantMessage, branchFromMessage } from '../chat/editBranch.js';
import { toggleReadAloud } from '../ui/readAloud.js';
import { selectShareVis, copyShareLink } from '../ui/share.js';
import { closeCheatsheet } from '../ui/cheatsheet.js';
import { clearRecentsFilter } from '../sidebar/index.js';
import { toggleDisplayPrefs } from '../displayPrefs.js';
import { openStorageModal, closeStorageModal } from '../ui/storage.js';
import { openPromptTemplatesModal, closePromptTemplatesModal } from '../ui/promptTemplates.js';
import { toggleAPI, clearSettings, saveSettings } from '../ui/settings.js';
import { toggleExtensionByKey } from '../pickers.js';
import { openCmdKResult } from '../ui/cmdK.js';
import { confirmClearCache, confirmClearSettings, confirmDeleteAccount } from '../ui/dangerConfirms.js';
import { processPendingMermaid, processPendingViz, reclaimVizCards } from '../render/viz.js';
import { wireCodeBlockHeaders, wireMsgBodyImages } from '../render/postRender.js';
import { mountVisualization, disposeVisualizations, disposeVisualization } from '../render/visualization.js';
import { appendInlineArtifact } from '../ui/toolCards.js';
import { formatMsgProgressive } from '../render/markdown.js';
import { stripCitationMarkers } from '../render/helpers.js';
import { stripChatArtifacts } from '../util/stripChatArtifacts.js';
import { publishThinkingPanelEvent } from '../ui/messageSnapshot.js';
import { retryLiveTurn, decideLiveApproval } from '../chat/liveTurn.js';
import { startSession } from '../chat/sessionBootstrap.js';
import { submitChatMessage } from '../chat/sendPipeline.js';
import { setRecentsSearch } from '../ui/recentsView.js';

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
window.addStreamingMessage = addStreamingMessage;
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
window.setCurrentUser = setCurrentUser;
window.markAuthSuccess = markAuthSuccess;
window.isInAuthGraceWindow = isInAuthGraceWindow;
window.clearPerUserClientState = clearPerUserClientState;
window.toggleAppMode = toggleAppMode;
window.updateModeBadge = updateModeBadge;
window.addMessage = addMessage;
window.askNextQuestion = askNextQuestion;
window.saveCurrentSession = saveCurrentSession;
window.fetchWebContext = fetchWebContext;
window.openAttachmentPicker = openAttachmentPicker;
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
    toggleSidebar: window.toggleSidebar,
    openNav: window.openNav,
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
    signOut: signOut,
  },
  settings: {
    toggleAPI: toggleAPI,
    addProvider: window.addProvider,
    clearSettings: clearSettings,
    saveSettings: saveSettings,
  },
  confirm: {
    closeConfirm: window.closeConfirm,
  },
  sessions: {
    loadSession: window.loadSession,
    setRecentsFilter: window.setRecentsFilter,
    getRecentsFilter: window.getRecentsFilter,
    setRecentsSearch: setRecentsSearch,
    retryRecentsFetch: retryRecentsFetch,
    clearRecentsFilter: clearRecentsFilter,
    onRecentsFilterChipClick: window.onRecentsFilterChipClick,
    openTagEditor: openTagEditor,
    deleteSession: actuallyDeleteSession,
    onSessionDragStart: onSessionDragStart,
    onSessionDragEnd: onSessionDragEnd,
    restoreSession: restoreSession,
    confirmPurgeSession: confirmPurgeSession,
  },
  composer: {
    openAttachmentPicker: window.openAttachmentPicker,
    composeAction: window.composeAction,
    researchAction: window.researchAction,
    deepResearchAction: window.deepResearchAction,
    analyzeAction: window.analyzeAction,
    toggleExtensionByKey: toggleExtensionByKey,
    removeAttachment: window.removeAttachment,
    renderAttachmentChips: window.renderAttachmentChips,
    startSession: startSession,
    submitChatMessage: submitChatMessage,
    stopChatResponse: stopChatResponse,
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
    confirmClearCache: confirmClearCache,
    confirmClearSettings: confirmClearSettings,
    confirmDeleteAccount: confirmDeleteAccount,
    setLang: window.setLang,
  },
  workspace: {
    switchLibraryTab: window.switchLibraryTab,
    filterLibrary: window.filterLibrary,
    openLibraryItem: window.openLibraryItem,
    toggleLibrarySelect: window.toggleLibrarySelect,
    toggleSelectAllLibrary: window.toggleSelectAllLibrary,
    deleteSelectedLibrary: window.deleteSelectedLibrary,
    startLibraryRename: window.startLibraryRename,
    cancelLibraryRename: window.cancelLibraryRename,
    saveLibraryRename: window.saveLibraryRename,
    deleteLibraryFile: window.deleteLibraryFile,
    renameArtifact: window.renameArtifact,
    openCreateProject: window.openCreateProject,
    openEditProject: window.openEditProject,
    openProjectWorkspace: window.openProjectWorkspace,
    connectProjectConnector: window.connectProjectConnector,
    refreshProjectConnector: window.refreshProjectConnector,
    openProjectConnectorForm: window.openProjectConnectorForm,
    exitPluginsView: window.exitPluginsView,
    openArxivSearch: window.openArxivSearch,
    openZoteroLibrary: window.openZoteroLibrary,
  },
  scheduled: {
    openCreateScheduledTask: window.openCreateScheduledTask,
    openEditScheduledTask: window.openEditScheduledTask,
    toggleScheduledTask: window.toggleScheduledTask,
    runScheduledTask: window.runScheduledTask,
    deleteScheduledTask: window.deleteScheduledTask,
  },
  postRender: {
    processPendingMermaid: processPendingMermaid,
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
    renderAssistantProgressive: function (rawText) {
      /* P_strip-citations — same body contract as renderAssistantHTML, so a
         marker never flashes in the live tail and then vanishes at finish. */
      return formatMsgProgressive(stripCitationMarkers(stripChatArtifacts(String(rawText || ''))));
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
