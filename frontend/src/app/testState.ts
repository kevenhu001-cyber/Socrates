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

const testState = Object.freeze({
  session: sessionStore.getState,
  kb: kbStore.getState,
  call: callStore.getState,
  ui: uiStore.getState,
  exam: examStore.getState,
  snapshot: composeRootState,
  patch: dispatchPatches,
  dispatchSession,
  subscribe: subscribeLegacyState,
});

export function installTestState(): void {
  // Playwright registers the receiver before navigation. App boot never
  // creates a state global on an ordinary page.
  const target = window as Window & {
    __installSocratesTestState?: (state: typeof testState) => void;
  };
  target.__installSocratesTestState?.(testState);
}
