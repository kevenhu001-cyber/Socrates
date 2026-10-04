/* chat/stats.js — Wave 0d of main-js-split plan.
 * Pure chat UI stats updater. Extracted from main.js region 28 (L9105).
 * Reads state via window.state (proxy); writes DOM only.
 */

function updateChatStats() {
  /* #chatStats and #chatModeBadge were both removed from the shell —
     nothing left to paint. The function stays as the semantic
     "stats changed" hook so callers need no edits. */
}

export { updateChatStats };
