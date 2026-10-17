import { stateStore } from '../state/store.js';
import { drainMessageOutbox } from '../session/mutationOutbox.js';
import { getChatIdFromURL, getExamIdFromURL, setChatIdInURL, setExamIdInURL } from '../session/store.ts';
import { loadSession } from '../session/loader.js';
import { loadUserMemories, renderUserFooter } from '../ui/profile.js';
import { syncExtensionsUI } from '../pickers.js';
import { syncSidebarForMode } from '../config/providers.ts';
import { syncWorkspaceRoute } from '../sidebar/navigation.service.ts';
import { toggleShareBtn } from '../ui/share.js';
import { renderGreeting } from '../ui/greeting.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { fetchWithAuthGraceRetry, restoreRoutedSession } from './postAuth/flow.ts';
import { migrateLegacyStorage } from './postAuth/migration.ts';

/** Legacy boot hooks still published on the window by main.js. */
interface PostAuthLegacyWindow extends Window {
  clearPerUserClientState?: () => void;
  saveCurrentSession?: () => void;
  isInAuthGraceWindow?: () => boolean;
  refreshServerSessions?: () => Promise<unknown>;
  refreshApiConfig?: () => Promise<unknown>;
  renderRecents?: () => void;
  renderMistakes?: () => void;
  updateMistakesBadge?: () => void;
  syncModelPills?: () => void;
  syncAppModeUI?: () => void;
  initialLoad?: () => void;
}

function clearPreviousUserState(): void {
  const win = window as PostAuthLegacyWindow;
  if (typeof win.clearPerUserClientState !== 'function') return;
  try { win.clearPerUserClientState(); }
  catch (error) { reportSwallow(error, 'auth/postAuth.clearPreviousUserState'); }
}

function replayQueuedMessageEdits(): void {
  const win = window as PostAuthLegacyWindow;
  try {
    Promise.resolve(drainMessageOutbox()).then((count) => {
      if (count > 0 && typeof win.saveCurrentSession === 'function') {
        try { win.saveCurrentSession(); }
        catch (error) { reportSwallow(error, 'auth/postAuth.drainOutbox.saveCurrentSession'); }
      }
    }).catch((error) => reportSwallow(error, 'auth/postAuth.drainOutbox'));
  } catch (error) { reportSwallow(error, 'auth/postAuth.drainOutbox.start'); }
}

async function fetchBootstrapData(): Promise<void> {
  const win = window as PostAuthLegacyWindow;
  const isInGraceWindow = () => typeof win.isInAuthGraceWindow === 'function'
    && win.isInAuthGraceWindow();
  await Promise.all([
    fetchWithAuthGraceRetry(win.refreshServerSessions, { isInGraceWindow }),
    fetchWithAuthGraceRetry(win.refreshApiConfig, { isInGraceWindow }),
    loadUserMemories().catch(() => null),
  ]);
}

function refreshAuthenticatedUi(): void {
  const win = window as PostAuthLegacyWindow;
  renderUserFooter();
  try { renderGreeting(); }
  catch (error) { reportSwallow(error, 'auth/postAuth.greeting'); }
  if (typeof win.renderRecents === 'function') win.renderRecents();
  if (typeof win.renderMistakes === 'function') win.renderMistakes();
  if (typeof win.updateMistakesBadge === 'function') win.updateMistakesBadge();
  if (typeof win.syncModelPills === 'function') win.syncModelPills();
  syncExtensionsUI();
  if (typeof win.syncAppModeUI === 'function') win.syncAppModeUI();
  syncSidebarForMode();
}

async function restoreSessionFromCurrentUrl(): Promise<void> {
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

function triggerInitialLoad(): void {
  const win = window as PostAuthLegacyWindow;
  if (typeof win.initialLoad === 'function') {
    win.initialLoad();
    return;
  }
  if (typeof win.renderRecents === 'function') win.renderRecents();
  if (typeof win.renderMistakes === 'function') {
    win.renderMistakes();
    if (typeof win.updateMistakesBadge === 'function') win.updateMistakesBadge();
  }
}

/** Load user-owned data and restore any chat/exam route after authentication. */
export async function afterAuthEnter(): Promise<void> {
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
