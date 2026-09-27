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
  /* P_save-snapshot — the single queued payload slot, captured at the moment
     the state changed and NOT at the moment the queue drains.

     Two producers write it: saveCurrentSession() when it finds a save already
     running, and saveSessionBeforeReset() on the new-chat path. Both capture
     while the session that changed is still current, and one slot is enough
     because a newer capture strictly supersedes an older one — the payload is
     a full snapshot, and buildDeltaPayload() filters it against the sync
     watermark, so posting only the newest loses nothing.

     This is what lets loadSession() stop draining the save pipeline. The drain
     existed because the queue used to end in doSave(), which re-captures from
     LIVE state — and by drain time the user had already moved to another
     session, so a re-capture would have posted the new conversation under the
     old id ("会话串台"). A self-contained snapshot can be posted verbatim no
     matter which session is current, so the drain is unnecessary and the
     session switch no longer waits on POST + list refresh + PATCH. */
  pendingSnapshot: null,
  /* P_reset-defer — payload captured by saveSessionBeforeReset and scheduled
     for the next macrotask so the new-chat click frame stays cheap. It is
     parked here for exactly one tick, and the pagehide/visibilitychange
     beacon below flushes it if the tab goes away inside that window —
     otherwise the captured conversation would be lost. */
  deferredSnapshot: null,
  loadingSession: false,
  loadSessionId: null,
};

export function getSaveState() {
  return saveState;
}
