import { stateStore } from '../state/store.js';
import { drainMessageOutbox } from '../session/mutationOutbox.js';
import { getChatIdFromURL, getExamIdFromURL, setChatIdInURL, setExamIdInURL } from '../session/store.js';
import { loadSession } from '../session/loader.js';
import { loadUserMemories, renderUserFooter } from '../ui/profile.js';
import { syncExtensionsUI } from '../pickers.js';
import { syncSidebarForMode } from '../config/providers.js';
import { syncWorkspaceRoute } from '../sidebar/navigation.service.ts';
import { toggleShareBtn } from '../ui/share.js';
import { renderGreeting } from '../ui/greeting.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { fetchWithAuthGraceRetry, restoreRoutedSession } from './postAuth/flow.js';
import { migrateLegacyStorage } from './postAuth/migration.js';

function clearPreviousUserState() {
  if (typeof window.clearPerUserClientState !== 'function') return;
  try { window.clearPerUserClientState(); }
  catch (error) { reportSwallow(error, 'auth/postAuth.clearPreviousUserState'); }
}

function replayQueuedMessageEdits() {
  try {
    Promise.resolve(drainMessageOutbox()).then((count) => {
      if (count > 0 && typeof window.saveCurrentSession === 'function') {
        try { window.saveCurrentSession(); }
        catch (error) { reportSwallow(error, 'auth/postAuth.drainOutbox.saveCurrentSession'); }
      }
    }).catch((error) => reportSwallow(error, 'auth/postAuth.drainOutbox'));
  } catch (error) { reportSwallow(error, 'auth/postAuth.drainOutbox.start'); }
}

async function fetchBootstrapData() {
  const isInGraceWindow = () => typeof window.isInAuthGraceWindow === 'function'
    && window.isInAuthGraceWindow();
  await Promise.all([
    fetchWithAuthGraceRetry(window.refreshServerSessions, { isInGraceWindow }),
    fetchWithAuthGraceRetry(window.refreshApiConfig, { isInGraceWindow }),
    loadUserMemories().catch(() => null),
  ]);
}

function refreshAuthenticatedUi() {
  renderUserFooter();
  try { renderGreeting(); }
  catch (error) { reportSwallow(error, 'auth/postAuth.greeting'); }
  if (typeof window.renderRecents === 'function') window.renderRecents();
  if (typeof window.renderMistakes === 'function') window.renderMistakes();
  if (typeof window.updateMistakesBadge === 'function') window.updateMistakesBadge();
  if (typeof window.syncModelPills === 'function') window.syncModelPills();
  syncExtensionsUI();
  if (typeof window.syncAppModeUI === 'function') window.syncAppModeUI();
  syncSidebarForMode();
}

async function restoreSessionFromCurrentUrl() {
  await restoreRoutedSession({
    chatId: getChatIdFromURL(),
    examId: getExamIdFromURL(),
    loadSession,
    onChatFailure: () => {
      stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: null });
      setChatIdInURL(null);
    },
    onExamFailure: () => {
      stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: null });
      setExamIdInURL(null);
    },
  });
}

function triggerInitialLoad() {
  if (typeof window.initialLoad === 'function') {
    window.initialLoad();
    return;
  }
  if (typeof window.renderRecents === 'function') window.renderRecents();
  if (typeof window.renderMistakes === 'function') {
    window.renderMistakes();
    if (typeof window.updateMistakesBadge === 'function') window.updateMistakesBadge();
  }
}

/** Load user-owned data and restore any chat/exam route after authentication. */
export async function afterAuthEnter() {
  toggleShareBtn();
  clearPreviousUserState();
  replayQueuedMessageEdits();
  await migrateLegacyStorage();
  await fetchBootstrapData();
  refreshAuthenticatedUi();
  await restoreSessionFromCurrentUrl();
  triggerInitialLoad();
  syncWorkspaceRoute();
}
