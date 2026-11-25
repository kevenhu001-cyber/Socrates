import { composeRootState } from '../state/index.ts';
import {
  callStore,
  dispatchPatches,
  dispatchSession,
  examStore,
  kbStore,
  sessionStore,
  uiStore,
} from '../store/index.ts';
import { subscribeLegacyState } from '../store/legacyListeners.ts';
import { getActiveTemplate } from '../chat/templateSystemPrompt.ts';
import { toggleSidebar } from '../sidebar/sidebar.service.ts';
import { toggleAppMode } from './lifecycle/mode.ts';
import { closeSettings } from '../react/settings/settings.service.ts';
import { getArchivedSessions } from '../session/recents.ts';
import { showGate, showAuthSignin } from '../auth/index.ts';

const testState = Object.freeze({
  session: sessionStore.getState,
  kb: kbStore.getState,
  call: callStore.getState,
  ui: uiStore.getState,
  exam: examStore.getState,
  snapshot: composeRootState,
  activeTemplate: () => {
    const template = getActiveTemplate();
    return template ? { ...template } : null;
  },
  patch: dispatchPatches,
  dispatchSession,
  subscribe: subscribeLegacyState,
  /* Test-only UI actions. They are exposed through the same receiver gate as
     the state snapshot, so production never gets a second action surface. */
  actions: Object.freeze({
    toggleSidebar,
    toggleAppMode,
    closeSettings,
    getArchivedSessions,
    showGate,
    showAuthSignin,
  }),
});

export function installTestState(): void {
  // Playwright registers the receiver before navigation. App boot never
  // creates a state global on an ordinary page.
  const target = window as Window & {
    __installSocratesTestState?: (state: typeof testState) => void;
  };
  target.__installSocratesTestState?.(testState);
}
