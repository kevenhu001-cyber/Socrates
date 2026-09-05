import {
  callBridge,
  examBridge,
  kbBridge,
  namespaceBridges,
  searchBridge,
  sessionBridge,
  uiBridge,
} from './bridges.ts';
import type { ImmutableBridge, RevisionedSnapshot } from '../lib/bridge/createImmutableBridge.ts';
import { createInitialCallState } from './call.ts';
import { createInitialExamState } from './exam.ts';
import { createInitialKbState } from './kb.ts';
import { createInitialSearchState } from './search.ts';
import { createInitialSessionState } from './session.ts';
import { createInitialUiState } from './ui.ts';

/**
 * Compose the root state from the current bridge snapshots.
 *
 * Kept for callers that want a one-shot, frozen view; the live
 * facade in `state/store.js` re-evaluates the bridges on every read so
 * its Proxy stays in sync with concurrent commits.
 */
export function composeRootState() {
  return Object.freeze({
    session: sessionBridge.getSnapshot(),
    kb: kbBridge.getSnapshot(),
    search: searchBridge.getSnapshot(),
    call: callBridge.getSnapshot(),
    ui: uiBridge.getSnapshot(),
    exam: examBridge.getSnapshot(),
  });
}

export function createInitialAppState() {
  return {
    session: createInitialSessionState(),
    kb: createInitialKbState(),
    search: createInitialSearchState(),
    call: createInitialCallState(),
    ui: createInitialUiState(),
    exam: createInitialExamState(),
  };
}

export type AppState = ReturnType<typeof createInitialAppState>;

/** Re-export the bridges for advanced callers. */
export {
  callBridge,
  examBridge,
  kbBridge,
  namespaceBridges,
  searchBridge,
  sessionBridge,
  uiBridge,
};

export type NamespaceBridge = ImmutableBridge<
  Readonly<Record<string, unknown>> & RevisionedSnapshot,
  unknown
>;
