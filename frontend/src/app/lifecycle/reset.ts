import {
  dispatchSession,
  examStore,
  kbStore,
  resetDomains,
  sessionStore,
  uiStore,
} from '../../store/index.ts';
import { turnState } from '../../chat/turn/state.ts';
import { detachActiveTurn } from '../../chat/turn/cancelActiveTurn.ts';
import { showConfirm } from '../../ui/confirm.js';
import {
  resetComposerForNewSession,
  focusComposerForNewSession,
} from '../../react/composer-input/lifecycle.ts';
import { clearLegacyMsgListChildren } from '../../ui/messageListDom.ts';
import { publishReactChatRuntime } from '../../ui/reactBridge.ts';
import { resetShareToken, toggleShareBtn } from '../../ui/share.ts';
import { clearSessionRouteInURL } from '../../session/store.ts';
import { scrollContainer } from '../../ui/scroll.ts';
import { saveSessionBeforeReset } from '../../session/persistence.ts';
import { renderGreeting } from '../../ui/greeting.js';
import { activateMainView } from '../../ui/mainViewController.ts';
import { setActiveNav } from '../../sidebar/navigation.service.ts';
import { projectSidebarOpen } from '../../sidebar/sidebar.service.ts';
import { isMobileViewport } from '../../sidebar/breakpoints.ts';
import { useSidebarStore } from '../../sidebar/sidebar.store.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { translateLifecycleText } from './translate.ts';
import { shouldConfirmReset } from './resetDecision.ts';
import { clearActiveTemplate } from '../../chat/templateSlash.ts';
import { renderRecents } from '../../ui/recentsView.ts';

function readResetDecision(options?: ResetOptions) {
  const examWasOpen =
    Boolean(uiStore.getState()._examInView) || document.body.classList.contains('exam-active');
  return {
    examWasOpen,
    requiresConfirmation: shouldConfirmReset({
      examWasOpen,
      examTopic: examStore.getState().examTopic,
      examQuestions: examStore.getState().examQuestions,
      examSubmitted: examStore.getState().examSubmitted,
      topic: sessionStore.getState().topic,
      knowledgeNodes: kbStore.getState().kbNodes,
      messages: sessionStore.getState().messages,
      confirmActiveSession: !(options && options.confirmActiveSession === false),
      chatStreaming: turnState.chatStreaming,
    }),
  };
}

async function confirmResetIfRequired(requiresConfirmation: boolean) {
  if (!requiresConfirmation) return true;
  return showConfirm(
    translateLifecycleText('confirm.newSession.title'),
    translateLifecycleText('confirm.newSession.msg'),
    false,
  );
}

function clearActivePromptTemplate() {
  try {
    clearActiveTemplate();
  } catch (error) {
    reportSwallow(error, 'app/lifecycle.resetApp.clearActiveTemplate');
  }
}

function prepareCurrentSessionForReset() {
  saveSessionBeforeReset();
  try {
    sessionStorage.removeItem('socrates-active-assistant');
  } catch (error) {
    reportSwallow(error, 'app/lifecycle.resetApp.clearActiveAssistant');
  }
  clearActivePromptTemplate();
  detachActiveTurn('session-reset');
  resetShareToken();
  try {
    turnState.pendingChatContent = null;
  } catch (error) {
    reportSwallow(error, 'app/lifecycle.resetApp.clearPendingChat');
  }
  try {
    turnState.pendingAttachments = null;
  } catch (error) {
    reportSwallow(error, 'app/lifecycle.resetApp.clearPendingAttachments');
  }
}

function renderTopicSetupAfterReset() {
  toggleShareBtn();
  clearSessionRouteInURL();
  activateMainView('topicSetup', document);
  setActiveNav(null);
  try {
    renderGreeting();
  } catch (error) {
    reportSwallow(error, 'app/lifecycle.resetApp.renderGreeting');
  }
  clearLegacyMsgListChildren();
  resetComposerForNewSession();
}

function renderListsAfterReset() {
  try {
    renderRecents();
  } catch (error) {
    reportSwallow(error, 'app/lifecycle.resetApp.renderRecents');
  }
  const sc = scrollContainer();
  if (sc) sc.scrollTop = 0;
}

function closeMobileSidebarAfterReset() {
  if (typeof window !== 'undefined' && !isMobileViewport()) return;
  /* The store is the open-state truth; skip when the drawer is already closed. */
  if (!useSidebarStore.getState().isOpen) return;
  projectSidebarOpen(false, { persist: true });
  const backdrop = document.getElementById('sidebarBackdrop');
  if (backdrop) backdrop.classList.remove('show');
}

function publishResetState() {
  publishReactChatRuntime({ type: 'state-synced', reason: 'session-reset' });
  focusComposerForNewSession();
}

export interface ResetOptions {
  confirmActiveSession?: boolean;
  projectId?: string;
}

/** Save, clear and return the app to topic setup while respecting live work. */
export async function resetApp(options?: ResetOptions) {
  const decision = readResetDecision(options);
  if (!(await confirmResetIfRequired(decision.requiresConfirmation))) {
    return false;
  }

  prepareCurrentSessionForReset();
  resetDomains();
  if (options?.projectId) {
    dispatchSession({ type: 'session/set', key: 'currentProjectId', value: options.projectId });
  }
  renderTopicSetupAfterReset();
  renderListsAfterReset();
  closeMobileSidebarAfterReset();
  publishResetState();
  return true;
}
