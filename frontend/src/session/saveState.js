/* session/saveState.js — centralized mutable save/load coordination state.
 * Extracted from main.js module-level vars to enable safe persistence
 * extraction. Single mutable object shared by main.js and new modules.
 * Zero-behavior-change: same initial values.
 */
import { createDeletedSessionGuard } from './store.js';

/* P_delete-resurrect — tombstone set for deleted session ids. Shared by
   persistence (doSave refuses to POST tombstoned ids) and deletion
   (actuallyDeleteSession sets, refresh clears). Centralized here so
   extracted modules share one instance. */
export var deletedSessionGuard = createDeletedSessionGuard();

export function rememberDeletedSession(id) {
  deletedSessionGuard.remember(id);
}
export function forgetDeletedSession(id) {
  deletedSessionGuard.forget(id);
}

export var saveState = {
  saveInFlight: null,
  saveDirty: false,
  /* Payload captured by saveSessionBeforeReset while another save was in
     flight; posted as soon as that request settles. */
  pendingSnapshot: null,
  loadingSession: false,
  loadSessionId: null,
};

export function getSaveState() {
  return saveState;
}
