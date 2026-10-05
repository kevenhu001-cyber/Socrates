/**
 * ui/msgListMount.ts — is the React message list mounted?
 *
 * A single boolean, owned by neither the React tree nor the legacy chat
 * layer, so both can read/write it without depending on each other.
 *
 * Why this exists: `chat/streamingTurn.js` needs to know whether React owns
 * `#msgList` before it decides to paint into the DOM itself. It used to
 * import `isMsgListMounted()` from `react/message-list/MessageList.tsx`,
 * which made the legacy hot path depend on the React tree — a directory-level
 * cycle (`chat/` → `react/`, while `react/` reads back from `chat/`'s state).
 * The flag now lives here, in the neutral `ui/` layer both already import.
 *
 * `scripts/check-chat-layering.mjs` fails the build if `src/chat/**` ever
 * imports from `src/react/**` again.
 */

let msgListMounted = false;

/** True once React has taken over `#msgList`. */
export function isMsgListMounted(): boolean {
  return msgListMounted;
}

/** Called by the React message list when it mounts and unmounts. */
export function setMsgListMounted(mounted: boolean): void {
  msgListMounted = mounted;
}
