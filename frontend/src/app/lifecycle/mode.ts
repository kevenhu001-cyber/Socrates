import { stateStore } from '../../state/store.ts';
import { appMode, setAppMode, syncAppModeUI, syncSidebarForMode } from '../../config/providers.ts';
import { showConfirm } from '../../ui/confirm.js';
import { saveCurrentSession } from '../../session/persistence.ts';
import { resetApp } from './reset.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { translateLifecycleText } from './helpers.ts';
import { hasActiveModeSession, resolveNextAppMode } from './modeDecision.ts';
import { runtimeWindow as browserWindow } from '../../types/runtimeWindow.ts';
import type { AppMode } from '../../config/providers.ts';

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

async function confirmSaveAndReset(nextMode: AppMode) {
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

function prepareActiveSessionForModeChange(nextMode: AppMode) {
  if (!activeConversationIsInView()) return null;
  return confirmSaveAndReset(nextMode);
}

function persistAndSyncMode(nextMode: AppMode) {
  setAppMode(nextMode);
  try { localStorage.setItem('socrates-appmode', appMode); }
  catch (error) { reportSwallow(error, 'app/lifecycle.toggleAppMode'); }
  syncAppModeUI();
  syncSidebarForMode();
  const banner = typeof browserWindow.tutorSocratic === 'object' && browserWindow.tutorSocratic
    && typeof browserWindow.tutorSocratic.renderModeBanner === 'function'
    ? browserWindow.tutorSocratic.renderModeBanner
    : null;
  if (banner) {
    try { banner.call(browserWindow.tutorSocratic); }
    catch (error) { reportSwallow(error, 'app/lifecycle.toggleAppMode.renderModeBanner'); }
  }
}

/** Confirm, save and reset an active session before changing Chat/Tutor mode. */
export async function toggleAppMode(targetMode: unknown) {
  const nextMode = resolveNextAppMode(targetMode, appMode);
  if (nextMode === appMode) {
    syncAppModeUI();
    return;
  }
  const preparation = prepareActiveSessionForModeChange(nextMode);
  if (preparation && !await preparation) return;
  persistAndSyncMode(nextMode);
}
