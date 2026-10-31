import { stateStore, resetState } from '../../state/store.ts';
import { turnState } from '../../chat/turnState.ts';
import { showConfirm } from '../../ui/confirm.js';
import { resetComposerForNewSession, focusComposerForNewSession } from '../../react/composer-input/lifecycle.ts';
import { clearLegacyMsgListChildren } from '../../ui/messageListDom.ts';
import { publishReactChatRuntime } from '../../ui/reactBridge.ts';
import { resetShareToken, toggleShareBtn } from '../../ui/share.ts';
import { clearSessionRouteInURL } from '../../session/store.ts';
import { scrollContainer } from '../../ui/scroll.ts';
import { saveSessionBeforeReset } from '../../session/persistence.ts';
import { renderGreeting } from '../../ui/greeting.js';
import { activateMainView } from '../../ui/mainViewController.ts';
import { setActiveNav } from '../../sidebar/navigation.service.ts';
import { setSidebarOpen } from '../../sidebar/sidebar.store.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { translateLifecycleText } from './helpers.ts';
import { shouldConfirmReset } from './resetDecision.ts';
import { runtimeWindow as browserWindow } from "../../types/runtimeWindow.ts";


function readResetDecision(options?: ResetOptions) {
  const examWasOpen = Boolean(stateStore.read('_examInView'))
    || document.body.classList.contains('exam-active');
  return {
    examWasOpen,
    requiresConfirmation: shouldConfirmReset({
      examWasOpen,
      examTopic: stateStore.read('examTopic'),
      examQuestions: stateStore.read('examQuestions'),
      examSubmitted: stateStore.read('examSubmitted'),
      topic: stateStore.read('topic'),
      knowledgeNodes: stateStore.read('kbNodes'),
      messages: stateStore.read('messages'),
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
    if (typeof browserWindow.clearActiveTemplate === 'function') browserWindow.clearActiveTemplate();
  } catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.clearActiveTemplate'); }
}

function abortActiveChat() {
  if (turnState.activeChatAbort) {
    try { turnState.activeChatAbort('session-reset'); }
    catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.abortActive'); }
  }
  if (turnState.activeChatCtl) {
    try { turnState.activeChatCtl.abort(); }
    catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.abortTurnState'); }
  }
  turnState.activeChatCtl = null;
  turnState.activeChatAbort = null;
  turnState.chatStreaming = false;
  turnState.chatStopMode = false;
}

function prepareCurrentSessionForReset() {

  saveSessionBeforeReset();
  try { sessionStorage.removeItem('socrates-active-assistant'); }
  catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.clearActiveAssistant'); }
  clearActivePromptTemplate();
  abortActiveChat();
  resetShareToken();
  try { turnState.pendingChatContent = null; }
  catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.clearPendingChat'); }
  try { turnState.pendingAttachments = null; }
  catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.clearPendingAttachments'); }
}

function renderTopicSetupAfterReset() {
  toggleShareBtn();
  clearSessionRouteInURL();
  activateMainView('topicSetup', document);
  setActiveNav(null);
  try { renderGreeting(); }
  catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.renderGreeting'); }
  clearLegacyMsgListChildren();
  resetComposerForNewSession();
}

function renderListsAfterReset() {
  try { browserWindow.renderRecents?.(); }
  catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.renderRecents'); }
  const sc = scrollContainer();
  if (sc) sc.scrollTop = 0;
}

function closeMobileSidebarAfterReset() {
  if (!(browserWindow.innerWidth < 768)) return;
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar || sidebar.classList.contains('collapsed')) return;
  sidebar.classList.add('collapsed');
  setSidebarOpen(false);
  if (backdrop) backdrop.classList.remove('show');
  try { localStorage.setItem('socrates-sb', '0'); }
  catch (error) { reportSwallow(error, 'app/lifecycle.resetApp'); }
}

function publishResetState() {
  publishReactChatRuntime({ type: 'state-synced', reason: 'session-reset' });
  focusComposerForNewSession();
}

export interface ResetOptions { confirmActiveSession?: boolean; projectId?: string }

/** Save, clear and return the app to topic setup while respecting live work. */
export async function resetApp(options?: ResetOptions) {
  const decision = readResetDecision(options);
  if (!await confirmResetIfRequired(decision.requiresConfirmation)) {
    return false;
  }

  prepareCurrentSessionForReset();
  resetState();
  if (options?.projectId) {
    stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: options.projectId });
  }
  renderTopicSetupAfterReset();
  renderListsAfterReset();
  closeMobileSidebarAfterReset();
  publishResetState();
  return true;
}
