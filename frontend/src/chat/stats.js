/* chat/stats.js — Wave 0d of main-js-split plan.
 * Pure chat UI stats updater. Extracted from main.js region 28 (L9105).
 * Reads state via window.state (proxy); writes DOM only.
 */

function updateChatStats() {
  var statsEl = document.getElementById("chatStats");
  if (statsEl) statsEl.textContent = "";
  /* U-H2 — refresh the chat-header mode badge on every stats update so
     it reflects the current mode as the chat view re-renders. */
  if (typeof window.updateModeBadge === "function") {
    try { window.updateModeBadge(); } catch {}
  }
}

export { updateChatStats };
