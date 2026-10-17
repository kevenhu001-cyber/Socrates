/* session/saveState.ts — centralized mutable save/load coordination state.
 * Extracted from main.js module-level vars to enable safe persistence
 * extraction. Single mutable object shared by main.js and new modules.
 * Zero-behavior-change: same initial values.
 */
import { createDeletedSessionGuard, type DeletedSessionGuard } from './store.ts';

/** A full session payload captured for a save. The persistence pipeline owns
 *  the exact shape; the queue only needs to carry it verbatim. */
export type SessionSnapshot = Record<string, unknown>;

/* P_delete-resurrect — tombstone set for deleted session ids. Shared by
   persistence (doSave refuses to POST tombstoned ids) and deletion
   (actuallyDeleteSession sets, refresh clears). Centralized here so
   extracted modules share one instance. */
export const deletedSessionGuard: DeletedSessionGuard = createDeletedSessionGuard();

export function rememberDeletedSession(id: string | null | undefined): void {
  deletedSessionGuard.remember(id);
}
export function forgetDeletedSession(id: string | null | undefined): void {
  deletedSessionGuard.forget(id);
}

export interface SaveState {
  saveInFlight: Promise<unknown> | null;
  saveDirty: boolean;
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
  pendingSnapshot: SessionSnapshot | null;
  /* P_reset-defer — payload captured by saveSessionBeforeReset and scheduled
     for the next macrotask so the new-chat click frame stays cheap. It is
     parked here for exactly one tick, and the pagehide/visibilitychange
     beacon below flushes it if the tab goes away inside that window —
     otherwise the captured conversation would be lost. */
  deferredSnapshot: SessionSnapshot | null;
  loadingSession: boolean;
  loadSessionId: string | null;
  /* Abort handle for the in-flight detail fetch; loadSession() aborts the
     previous one before starting the next so a fast switch does not leave
     two multi-megabyte JSON parses racing. */
  loadAbortCtl: AbortController | null;
}

export const saveState: SaveState = {
  saveInFlight: null,
  saveDirty: false,
  pendingSnapshot: null,
  deferredSnapshot: null,
  loadingSession: false,
  loadSessionId: null,
  loadAbortCtl: null,
};

export function getSaveState(): SaveState {
  return saveState;
}
