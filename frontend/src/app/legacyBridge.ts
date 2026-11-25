import { updateSessionMetadata } from '../session/rowActions.ts';
/* app/legacyBridge.ts — extracted from legacy entry.
 * Legacy window bridges (window.X = X for inline handlers / cross-module
 * callers) + the typed window.__socratesLegacy gateway for React.
 * Zero-behavior-change lift. Imported once by app entry for side effects;
 * all entries resolve to direct imports (no window-read ordering hazards
 * except the documented optional surfaces that remain window.* reads).
 */
import { setChatStopState, handleSendClick, stopChatResponse } from '../chat/turn/composer.ts';
import {
  markAuthSuccess,
  resetApp,
  startNewChat,
  signOut,
  toggleIncognito,
} from './lifecycle/index.ts';
import { clearActiveTemplate } from '../chat/templateSlash.ts';
import { openTagEditor, onSessionDragStart, onSessionDragEnd } from '../session/organizeRuntime.ts';
import { askChatTurn } from '../chat/turn/controller.js';
import { addStreamingMessage } from '../chat/turn/loadStreamingTurn.ts';
import { loadSession } from '../session/loader.ts';
import {
  retryRecentsFetch,
  actuallyDeleteSession,
  archiveSession,
  restoreSession,
  confirmPurgeSession,
  flushRecentsReconcile,
} from '../session/recents.ts';
import { renderRecents } from '../legacy/recentsView.ts';
import { openNav } from '../sidebar/navigation.service.ts';
import { closeConfirm, showConfirm } from '../legacy/confirm.js';
import { deleteUserMessage, sendFeedback } from '../legacy/messageActions.ts';
import { buildAssistantHtml as renderAssistantHTML } from '../render/assistantHtml.ts';
import { showToast } from '../legacy/toast.ts';
import { addMessage } from '../chat/messages.ts';
import { askNextQuestion } from '../tutor/socraticTurn.ts';
import { saveCurrentSession } from '../session/persistence.ts';
/* chat/webSearch.ts (~16KB) is lazy — the window.fetchWebContext hook
   below returns a promise, which every caller already awaits. */
import {
  openAttachmentPicker,
  openMediaPicker,
  renderAttachmentChips,
  retryComposerAttachment,
} from '../attachments/render.ts';
import { removeAttachment } from '../attachments/index.ts';
import {
  saveProfileName,
  onCustomInstructionsChange,
  toggleProfileWebSearch,
  openProfile,
  closeProfile,
} from '../legacy/profile.ts';
import {
  regenerateAssistantMessage,
  branchFromMessage,
  switchMessageBranch,
} from '../chat/editBranch.ts';
import { toggleReadAloud } from '../legacy/readAloud.ts';
import {
  selectShareVis,
  openShareModal,
  closeShareModal,
  createShareLink,
  revokeShareLink,
} from '../legacy/share.ts';
import { openCheatsheet, closeCheatsheet } from '../legacy/cheatsheet.js';
import { closeMorePopover } from '../sidebar/morePopover.ts';
import {
  composeAction,
  researchAction,
  exploreAction,
  deepResearchAction,
  analyzeAction,
  dispatchExtension,
} from '../extensions/index.ts';
import { toggleDisplayPrefs } from '../displayPrefs.ts';
import { openStorageModal, closeStorageModal } from '../legacy/storage.js';
import { openPromptTemplatesModal, closePromptTemplatesModal } from '../legacy/promptTemplates.ts';
import { toggleWebSearch } from '../chat/webSearchToggle.ts';
import { openCmdK, closeCmdK, onCmdKInput, onCmdKKey, openCmdKResult } from '../legacy/cmdK.ts';
import { loadWebSearch } from '../chat/webSearchLoader.ts';
/* legacy/dangerConfirms.js is lazy — confirm actions import it on demand. */
import {
  processPendingMermaid,
  processPendingViz,
  reclaimVizCards,
  schedulePendingMermaid,
  processPendingVizActions,
} from '../render/vizStubs.ts';
import { wireCodeBlockHeaders } from '../render/postRender.ts';
import {
  mountVisualization,
  disposeVisualizations,
  disposeVisualization,
} from '../render/vizStubs.ts';
import { formatMsgProgressive } from '../render/markdown.ts';
import { stripCitationMarkers } from '../render/text.ts';
import { stripChatArtifacts } from '../util/stripChatArtifacts.ts';
import { decideLiveApproval } from '../chat/liveTurn.ts';
import { startSession } from '../chat/sessionBootstrap/index.ts';
import { submitChatMessage } from '../chat/sendPipeline.ts';
import { setRecentsSearch } from '../legacy/recentsView.ts';
import { setLang } from '../i18n/index.ts';
import { setLegacyActions } from '../react/legacy/gateway.ts';
import type { LegacyActions } from '../react/legacy/types.ts';

type DangerConfirmsModule = typeof import('../legacy/dangerConfirms.ts');
let _dangerImport: Promise<DangerConfirmsModule> | null = null;
function _loadDangerConfirms() {
  if (!_dangerImport) {
    _dangerImport = import('../legacy/dangerConfirms.ts');
    _dangerImport.catch(function (err) {
      _dangerImport = null;
      console.error('[dangerConfirms] failed to load', err);
    });
  }
  return _dangerImport;
}

// Browser hooks are a test-only compatibility surface. Playwright installs
// `__installSocratesTestState` before navigation; production boot never
// creates these globals. The transport fallback in chat/format.ts imports
// askChatTurn directly, so the app no longer needs a window copy.
if (
  typeof window !== 'undefined' &&
  typeof (window as Window & { __installSocratesTestState?: unknown })
    .__installSocratesTestState === 'function'
) {
  Object.assign(window, {
    askChatTurn,
    addStreamingMessage,
    loadSession,
    renderRecents,
    setChatStopState,
    handleSendClick,
    markAuthSuccess,
    addMessage,
    askNextQuestion,
    saveCurrentSession,
    fetchWebContext: (
      query: Parameters<(typeof import('../chat/webSearch.ts'))['fetchWebContext']>[0],
      opts?: Parameters<(typeof import('../chat/webSearch.ts'))['fetchWebContext']>[1],
    ) => loadWebSearch().then((module) => module.fetchWebContext(query, opts)),
    renderAssistantHTML,
    showToast,
    resetApp,
    startNewChat,
    startSession,
    submitChatMessage,
  });
}

const legacyActions: LegacyActions = {
  messages: {
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
    openNav,
    openSettings: () =>
      import('../react/settings/settings.service.ts').then((module) => module.openSettings()),
    openProfile,
    closeProfile,
    openUsageModal: () => import('../legacy/usage.ts').then((module) => module.openUsageModal()),
    closeUsageModal: () => import('../legacy/usage.ts').then((module) => module.closeUsageModal()),
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
    openTagEditor: (sessionId, event) =>
      openTagEditor(
        sessionId,
        event
          ? {
              stopPropagation: () => event.stopPropagation(),
              preventDefault: () => event.preventDefault(),
              currentTarget: event.currentTarget instanceof Element ? event.currentTarget : null,
            }
          : null,
      ),
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
    composeAction,
    researchAction,
    deepResearchAction,
    analyzeAction,
    toggleExtensionByKey: (key) => {
      dispatchExtension(key);
    },
    removeAttachment,
    retryAttachment: retryComposerAttachment,
    renderAttachmentChips,
    startSession,
    submitChatMessage,
    stopChatResponse,
    clearActiveTemplate,
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
    revokeShareLink,
    closeShareModal,
  },
  profile: {
    saveProfileName,
    onCustomInstructionsChange,
    toggleProfileWebSearch,
    confirmClearCache: function () {
      return _loadDangerConfirms().then(function (m) {
        return m.confirmClearCache();
      });
    },
    confirmClearSettings: function () {
      return _loadDangerConfirms().then(function (m) {
        return m.confirmClearSettings();
      });
    },
    confirmDeleteAccount: function () {
      return _loadDangerConfirms().then(function (m) {
        return m.confirmDeleteAccount();
      });
    },
    setLang,
  },
  postRender: {
    processPendingMermaid,
    schedulePendingMermaid: () => schedulePendingMermaid(),
    processPendingViz,
    reclaimVizCards,
    processPendingVizActions,
    wireCodeBlockHeaders,
    /* chart specs are normalized from toolCalls[];
       the React attachment owns the renderer host and its effect lifecycle. */
    mountVisualization: (spec, host, options) => mountVisualization(spec, host, options),
    /* React host teardown: dispose every card (and its renderer resources)
       in the host when the owning component unmounts or remounts. */
    disposeVisualizations,
    /* Teardown for one card React captured from mountVisualization's return
       value — survives a host the legacy pipeline emptied first. */
    disposeVisualization: (card) =>
      disposeVisualization(card as Parameters<typeof disposeVisualization>[0]),
  },
  /* markdown rendering stays in legacy (it owns the
     viz/mermaid placeholder registration that postRender fills in), but the
     tool rows no longer do: react/tool-run renders those from toolCalls[].
     AssistantTurn calls renderAssistantHTML per prose segment, so the answer
     text keeps formatting exactly as before. */
  render: {
    renderAssistantHTML,
    /* the streaming-safe renderer, same one the old
       imperative doRender painted with. formatMsg assumes closed pairs, so
       feeding it a half-arrived `$$…$$` or an open fence leaks raw LaTeX into
       the bubble; this preprocessor tolerates partial input. AssistantTurn
       keeps this renderer for the lifetime of a streamed turn, including finish. */
    renderAssistantProgressive: function (rawText, opts) {
      /* same body contract as renderAssistantHTML, so a
         marker never flashes in the live tail and then vanishes at finish.
         `opts.complete` marks text that can no longer grow (a settled
         block): it renders exactly as renderAssistantHTML will at finish. */
      return formatMsgProgressive(
        stripCitationMarkers(stripChatArtifacts(String(rawText || ''))),
        opts,
      );
    },
  },
  /* Live controls remain owned by the streaming pipeline. */
  liveTurn: {
    decideApproval: function (messageId, toolCallId, decision) {
      return decideLiveApproval(messageId, toolCallId, decision) ?? undefined;
    },
  },
};

setLegacyActions(legacyActions);
