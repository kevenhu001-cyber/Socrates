import { reportSwallow } from '../../util/reportSwallow.ts';
import { turnState } from './state.ts';
export { setChatStopState, handleSendClick, stopChatResponse } from './composer.ts';

/** A promise-like the quiet-turn guard can attach a rejection handler to. */
interface Catchable {
  catch(onRejected: (error: unknown) => void): unknown;
}

/* P_turn-abort-quiet — lifecycle aborts (auth expiry, session switch,
   turn superseded, …) are intentional control flow, not errors. */
export function isExpectedTurnAbort(e: unknown): boolean {
  if (!e) return true;
  const error = e as { reason?: unknown; message?: unknown; name?: unknown };
  let s: string;
  try {
    s = String(
      (error.reason != null ? error.reason : '') + ' ' + (error.message || e),
    ).toLowerCase();
  } catch {
    return false;
  }
  if (
    /session-expired|session-switch|session-deleted|session-purged|session-reset|archived-session|new-session|superseded|msg-edit|msg-regen|signout|sign-out|user-stop|user_stop|cancelled|canceled|first-delta-timeout/.test(
      s,
    )
  )
    return true;
  let nm = '';
  try {
    nm = String(error.name || '');
  } catch (err) {
    reportSwallow(err, 'chat/turn/ui.isExpectedTurnAbort');
  }
  if (nm === 'AbortError' && /abort/i.test(s)) return true;
  return false;
}

/* P_turn-abort-quiet — rejection guard for fire-and-forget turn promises.
   Expected lifecycle aborts vanish; real failures log to console (the
   stream controller already surfaced them in-bubble, so no banner). */
export function quietTurn<T>(p: T): T {
  const catchable = p as unknown as Catchable | null | undefined;
  if (catchable && typeof catchable.catch === 'function') {
    catchable.catch(function (e) {
      if (!isExpectedTurnAbort(e)) {
        try {
          console.error('[chat] turn failed:', e);
        } catch (err) {
          reportSwallow(err, 'chat/turn/ui.quietTurn');
        }
      }
    });
  }
  return p;
}

export function markTurnInProgress(): void {
  turnState.turnUi.inProgress = true;
}

export function markTurnEnded(): void {
  turnState.turnUi.inProgress = false;
}
