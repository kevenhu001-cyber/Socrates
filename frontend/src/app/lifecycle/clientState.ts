import { clearSharedProseCache } from '../../render/proseCache.ts';
import { saveState } from '../../session/saveState.ts';
import { detailCache } from '../../session/detailCache.ts';
import { turnState } from '../../chat/turnState.ts';
import { serverCache } from '../../session/serverCache.ts';
import { setAppMode, LAST_ACTIVE_ID_KEY } from '../../config/providers.ts';
import { resetProviderConfigForUser } from '../../config/providerConfig.service.ts';
import { resetCmdKSearchState } from '../../ui/cmdK.ts';
import { syncModelPills } from '../../pickers.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { clearUserMemories } from './userMemory.ts';
import { resetExamSaveStateIfLoaded } from './examSaveReset.ts';
import { runtimeWindow as browserWindow } from "../../types/runtimeWindow.ts";


function attemptCleanup(context: string, cleanup: () => unknown, severity?: Parameters<typeof reportSwallow>[2]) {
  try { cleanup(); }
  catch (error) { reportSwallow(error, context, severity); }
}

function clearStorageKey(key: string, context: string) {
  attemptCleanup(context, () => localStorage.removeItem(key), 'expected');
}

function clearExamSaveState() {
  resetExamSaveStateIfLoaded();
}

function callWindowHook(name: 'renderRecents' | 'renderMistakes' | 'updateMistakesBadge') {
  try {
    if (typeof browserWindow[name] === 'function') browserWindow[name]();
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
  attemptCleanup('app/lifecycle.clearPerUser.sessionLoad', () => saveState.loadAbortCtl?.abort());
  attemptCleanup('app/lifecycle.clearPerUser.renderCache', clearSharedProseCache);
  attemptCleanup('app/lifecycle.clearPerUser.detailCache', () => detailCache.clear());
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
  clearStorageKey('socrates-projects', 'app/lifecycle.clearPerUser.projectsCache');
  clearStorageKey('socrates-provider-keys', 'app/lifecycle.clearPerUser.providerKeysCache');
  clearStorageKey('socrates-websearch', 'app/lifecycle.clearPerUser.websearchCache');
  clearStorageKey('socrates-appmode', 'app/lifecycle.clearPerUser.appmodeCache');
  attemptCleanup('app/lifecycle.clearPerUser.setAppMode', () => setAppMode('chat'));
  clearStorageKey(LAST_ACTIVE_ID_KEY, 'app/lifecycle.clearPerUser.lastActiveId');

  attemptCleanup('app/lifecycle.clearPerUser.refreshVisibleLists', renderUserLists);
}
