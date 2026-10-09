import { stateStore, resetState } from '../../state/store.js';
import { turnState } from '../../chat/turnState.js';
import { showConfirm } from '../../ui/confirm.js';
import { resetComposerForNewSession, focusComposerForNewSession } from '../../react/composer-input/lifecycle.ts';
import { clearLegacyMsgListChildren } from '../../ui/messageListDom.js';
import { publishReactChatRuntime } from '../../ui/reactBridge.js';
import { publishThinkingTurnStart } from '../../ui/messageSnapshot.js';
import { resetShareToken, toggleShareBtn } from '../../ui/share.js';
import { clearSessionRouteInURL } from '../../session/store.js';
import { scrollContainer } from '../../ui/scroll.js';
import { saveSessionBeforeReset } from '../../session/persistence.js';
import { renderGreeting } from '../../ui/greeting.js';
import { activateMainView } from '../../ui/mainViewController.js';
import { setActiveNav } from '../../sidebar/navigation.service.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { translateLifecycleText } from './helpers.js';
import { shouldConfirmReset } from './resetDecision.js';

function readResetDecision(options) {
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

async function confirmResetIfRequired(requiresConfirmation) {
  if (!requiresConfirmation) return true;
  return showConfirm(
    translateLifecycleText('confirm.newSession.title'),
    translateLifecycleText('confirm.newSession.msg'),
    false,
  );
}

function clearActivePromptTemplate() {
  try {
    if (typeof window.clearActiveTemplate === 'function') window.clearActiveTemplate();
  } catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.clearActiveTemplate'); }
}

function abortActiveChat() {
  if (window._activeChatAbort) {
    try { window._activeChatAbort('session-reset'); }
    catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.abortActive'); }
  }
  if (turnState.activeChatCtl) {
    try { turnState.activeChatCtl.abort(); }
    catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.abortTurnState'); }
  }
  turnState.activeChatCtl = null;
  window._activeChatAbort = null;
  turnState.chatStreaming = false;
  turnState.chatStopMode = false;
}

function prepareCurrentSessionForReset() {
  publishThinkingTurnStart();
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

function restoreNextProjectAfterReset() {
  if (!window._nextProjectId) return;
  stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: window._nextProjectId });
  window._nextProjectId = null;
}

function renderTopicSetupAfterReset(examWasOpen) {
  toggleShareBtn();
  clearSessionRouteInURL();
  activateMainView('topicSetup', document);
  setActiveNav(null);
  try { renderGreeting(); }
  catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.renderGreeting'); }
  if (examWasOpen) {
    const examBody = document.getElementById('examViewBody');
    if (examBody) examBody.innerHTML = '';
  }
  clearLegacyMsgListChildren();
  resetComposerForNewSession();
  const knowledgeContent = document.getElementById('kbContent');
  knowledgeContent.innerHTML = '<div class="kb-empty">'
    + (typeof t === 'function'
      ? translateLifecycleText('tutor.kbTopicFirst')
      : 'Set a topic to build your knowledge map.')
    + '</div>';
  const teachingPlan = document.getElementById('teachingPlanContent');
  if (teachingPlan) teachingPlan.innerHTML = '';
}

function renderListsAfterReset() {
  callWindowHook('renderRecents');
  callWindowHook('renderMistakes');
  callWindowHook('updateMistakesBadge');
  scrollContainer().scrollTop = 0;
}

function callWindowHook(name) {
  try {
    if (typeof window[name] === 'function') window[name]();
  } catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.' + name); }
}

function closeMobileSidebarAfterReset() {
  if (!(window.innerWidth < 768)) return;
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar || sidebar.classList.contains('collapsed')) return;
  sidebar.classList.add('collapsed');
  try { window.sidebarOpen = false; }
  catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.sidebarOpenFlag'); }
  if (backdrop) backdrop.classList.remove('show');
  try { localStorage.setItem('socrates-sb', '0'); }
  catch (error) { reportSwallow(error, 'app/lifecycle.resetApp'); }
}

function publishResetState() {
  if (typeof window.syncConversationActive === 'function') {
    try { window.syncConversationActive(); }
    catch (error) { reportSwallow(error, 'app/lifecycle.resetApp.syncConversationActive'); }
  }
  publishReactChatRuntime({ type: 'state-synced', reason: 'session-reset' });
  focusComposerForNewSession();
}

/** Save, clear and return the app to topic setup while respecting live work. */
export async function resetApp(options) {
  const decision = readResetDecision(options);
  if (!await confirmResetIfRequired(decision.requiresConfirmation)) {
    window._nextProjectId = null;
    return false;
  }

  prepareCurrentSessionForReset();
  resetState();
  restoreNextProjectAfterReset();
  renderTopicSetupAfterReset(decision.examWasOpen);
  renderListsAfterReset();
  closeMobileSidebarAfterReset();
  callWindowHook('syncSidebarBtns');
  publishResetState();
  return true;
}
