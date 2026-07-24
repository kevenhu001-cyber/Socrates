// src/chat/stats.ts
//
// Pure chat UI stats updater. Reads state via window.state (proxy);
// writes DOM only. Extracted from main.js region 28 (L9105).

import { esc } from '../render/helpers.js';

export function updateChatStats(): void {
  const statsEl = document.getElementById('chatStats');
  if (statsEl) statsEl.textContent = '';
  const badge = document.getElementById('chatApiBadge');
  if (!badge) return;
  const winState = (window as any).state;
  const lastSource: string | undefined = winState && winState.lastCallSource;
  const lastError: string | undefined = winState && winState.lastCallError;
  if (lastSource === 'api') {
    badge.textContent = 'API';
    badge.className = 'chat-api-badge on';
    badge.title = 'Last reply came from the configured model.';
  } else if (lastSource === 'mock') {
    const reason = lastError || 'no provider';
    const shortReason = reason.length > 80 ? reason.slice(0, 77) + '\u2026' : reason;
    badge.innerHTML = '<svg class="icon-inline" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1.5a.75.75 0 0 1 .65.375l6.25 11.25a.75.75 0 0 1-.65 1.125H1.75a.75.75 0 0 1-.65-1.125L7.35 1.875A.75.75 0 0 1 8 1.5zM8 5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 1 0v-3A.5.5 0 0 0 8 5zm0 5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z"/></svg> mock (' + esc(shortReason) + ')';
    badge.className = 'chat-api-badge mocked';
    badge.title = 'Fallback reason: ' + reason + '. Reply came from the local mock engine. Check API settings if this is unexpected.';
  } else {
    badge.textContent = '';
    badge.className = 'chat-api-badge';
    badge.title = '';
  }
  /* U-H2 — refresh the chat-header mode badge on every stats update so
     it reflects the current mode as the chat view re-renders. */
  if (typeof (window as any).updateModeBadge === 'function') {
    try { (window as any).updateModeBadge(); } catch (_) { /* ignore */ }
  }
}
