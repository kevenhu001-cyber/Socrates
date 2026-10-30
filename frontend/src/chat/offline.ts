// src/chat/offline.ts — Phase C-3.4 extraction
// Universal AI-call retry/offline helpers, shared by the chat streaming
// code paths.
//
//   STREAM_MAX_ATTEMPTS — chat stream attempt budget.
//   offlineGuard()      — navigator.onLine check
//
// There is deliberately no watchdog / heartbeat / total-budget helper here:
// a reasoning model may think for an unbounded amount of time, so the client
// never aborts a response on its own. Only a user stop, a session switch, or
// a transport error ends a request.
//
/* Six attempts = the initial request plus five fixed-delay retries. */
export const STREAM_MAX_ATTEMPTS  = 6;

/* Returns true if we know the network is unreachable. Callers should
   short-circuit their fetch attempts in that case (no point waiting
   for the fixed retry delay). */
export function offlineGuard(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return false;
}
