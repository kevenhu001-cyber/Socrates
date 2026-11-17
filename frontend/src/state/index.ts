import {
  callBridge,
  examBridge,
  kbBridge,
  searchBridge,
  sessionBridge,
  uiBridge,
} from './bridges.ts';
import { createInitialCallState } from './call.ts';
import { createInitialExamState } from './exam.ts';
import { createInitialKbState } from './kb.ts';
import { createInitialSearchState } from './search.ts';
import { createInitialSessionState } from './session.ts';
import { createInitialUiState } from './ui.ts';

/**
 * Compose the root state from the current bridge snapshots.
 *
 * One-shot, frozen view for callers that need a whole-state read.
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
