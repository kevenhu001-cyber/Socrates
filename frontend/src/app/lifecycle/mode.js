import { stateStore } from '../../state/store.js';
import { appMode, setAppMode, syncAppModeUI, syncSidebarForMode } from '../../config/providers.js';
import { showConfirm } from '../../ui/confirm.js';
import { saveCurrentSession } from '../../session/persistence.js';
import { resetApp } from './reset.js';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { translateLifecycleText } from './helpers.js';
import { hasActiveModeSession, resolveNextAppMode } from './modeDecision.js';

function activeConversationIsInView() {
  const messageList = document.getElementById('msgList');
  const hasRealMessages = messageList && Array.from(messageList.children)
    .some((child) => !child.hasAttribute('data-react-message-list-empty'));
  return hasActiveModeSession({
    topic: stateStore.read('topic'),
    knowledgeNodes: stateStore.read('kbNodes'),
    phase: stateStore.read('phase'),
    hasRealMessages,
  });
}

async function confirmSaveAndReset(nextMode) {
  const nextLabel = translateLifecycleText(nextMode === 'tutor' ? 'tutor.modeTutor' : 'tutor.modeChat');
  const confirmed = await showConfirm(
    translateLifecycleText('confirm.switchMode.title').replace('{mode}', nextLabel),
    translateLifecycleText('confirm.switchMode.msg'),
    false,
  );
  if (!confirmed) return false;

  const savePromise = saveCurrentSession();
  if (savePromise) {
    try { await savePromise; }
    catch (error) { reportSwallow(error, 'app/lifecycle.toggleAppMode.saveCurrent'); }
  }
  const resetSucceeded = await resetApp({ confirmActiveSession: false });
  return resetSucceeded !== false;
}

function prepareActiveSessionForModeChange(nextMode) {
  if (!activeConversationIsInView()) return null;
  return confirmSaveAndReset(nextMode);
}

function persistAndSyncMode(nextMode) {
  setAppMode(nextMode);
  try { localStorage.setItem('socrates-appmode', appMode); }
  catch (error) { reportSwallow(error, 'app/lifecycle.toggleAppMode'); }
  syncAppModeUI();
  syncSidebarForMode();
  const banner = typeof tutorSocratic === 'object' && tutorSocratic
    && typeof tutorSocratic.renderModeBanner === 'function'
    ? tutorSocratic.renderModeBanner
    : null;
  if (banner) {
    try { banner.call(tutorSocratic); }
    catch (error) { reportSwallow(error, 'app/lifecycle.toggleAppMode.renderModeBanner'); }
  }
}

/** Confirm, save and reset an active session before changing Chat/Tutor mode. */
export async function toggleAppMode(targetMode) {
  const nextMode = resolveNextAppMode(targetMode, appMode);
  if (nextMode === appMode) {
    syncAppModeUI();
    return;
  }
  const preparation = prepareActiveSessionForModeChange(nextMode);
  if (preparation && !await preparation) return;
  persistAndSyncMode(nextMode);
}
