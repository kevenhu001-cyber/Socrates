import { turnState } from '../../chat/turnState.js';
import { serverCache } from '../../session/serverCache.js';
import { setAppMode, LAST_ACTIVE_ID_KEY } from '../../config/providers.js';
import { resetProviderConfigForUser } from '../../config/providerConfig.service.ts';
import { resetCmdKSearchState } from '../../ui/cmdK.js';
import { syncModelPills } from '../../pickers.js';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { clearUserMemories } from './userMemory.js';

function attemptCleanup(context, cleanup, severity) {
  try { cleanup(); }
  catch (error) { reportSwallow(error, context, severity); }
}

function clearStorageKey(key, context) {
  attemptCleanup(context, () => localStorage.removeItem(key), 'expected');
}

function clearExamSaveState() {
  const examModule = typeof window !== 'undefined' && window.__examModule;
  if (examModule && typeof examModule.resetExamSaveState === 'function') {
    examModule.resetExamSaveState();
  }
}

function callWindowHook(name) {
  try {
    if (typeof window[name] === 'function') window[name]();
  } catch (error) { reportSwallow(error, 'app/lifecycle.clearPerUser.' + name); }
}

function renderUserLists() {
  callWindowHook('renderRecents');
  callWindowHook('renderMistakes');
  callWindowHook('updateMistakesBadge');
  attemptCleanup('app/lifecycle.clearPerUser.syncModelPills', syncModelPills);
}

/** Clear user-owned caches before a new user can see the application shell. */
export function clearPerUserClientState() {
  attemptCleanup('app/lifecycle.clearPerUser.serverCache', () => {
    if (Array.isArray(serverCache.sessions)) serverCache.sessions.length = 0;
  });
  attemptCleanup('app/lifecycle.clearPerUser.fetchFailed', () => { serverCache.fetchFailed = false; });
  attemptCleanup('app/lifecycle.clearPerUser.providerConfig', resetProviderConfigForUser);
  attemptCleanup('app/lifecycle.clearPerUser.cmdKIndex', resetCmdKSearchState);
  attemptCleanup('app/lifecycle.clearPerUser.examSave', clearExamSaveState);
  attemptCleanup('app/lifecycle.clearPerUser.userMemories', clearUserMemories);
  attemptCleanup('app/lifecycle.clearPerUser.pendingChat', () => {
    if (turnState.pendingChatContent !== undefined) turnState.pendingChatContent = null;
  });

  clearStorageKey('socrates-sessions-v2', 'app/lifecycle.clearPerUser.sessionsCache');
  clearStorageKey('socrates-api', 'app/lifecycle.clearPerUser.apiCache');
  clearStorageKey('socrates-guest', 'app/lifecycle.clearPerUser.guestCache');
  clearStorageKey('socrates-projects', 'app/lifecycle.clearPerUser.projectsCache');
  clearStorageKey('socrates-recents-filter', 'app/lifecycle.clearPerUser.recentsFilterCache');
  clearStorageKey('socrates-provider-keys', 'app/lifecycle.clearPerUser.providerKeysCache');
  clearStorageKey('socrates-websearch', 'app/lifecycle.clearPerUser.websearchCache');
  clearStorageKey('socrates-appmode', 'app/lifecycle.clearPerUser.appmodeCache');
  attemptCleanup('app/lifecycle.clearPerUser.setAppMode', () => setAppMode('chat'));
  clearStorageKey(LAST_ACTIVE_ID_KEY, 'app/lifecycle.clearPerUser.lastActiveId');

  attemptCleanup('app/lifecycle.clearPerUser.refreshVisibleLists', renderUserLists);
}
