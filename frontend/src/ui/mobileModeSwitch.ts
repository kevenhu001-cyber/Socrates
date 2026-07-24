/* ui/mobileModeSwitch.ts — mobile-only 对话/导师 (Chat/Tutor) switcher.
 *
 * P_mobile-topbar. The desktop segmented pill (#modeSegmentedTop) is
 * hidden under 640px, leaving touch users with no way to switch between
 * Chat and Tutor from the top bar. This module drives the compact
 * "Chat ˅" dropdown that replaces it on mobile:
 *
 *   - toggleMobileModeMenu()  opens/closes the popover (#mobileModeMenu)
 *   - selectAppMode(mode)     switches mode via window.toggleAppMode()
 *   - syncMobileModeSwitch()  refreshes the trigger label + active item;
 *                             called from providers.js syncAppModeUI().
 *
 * The popover animation is CSS-driven off [data-open] on #mobileMode; we
 * only flip that attribute + aria-expanded here.
 */

function _t(key: string, fallback: string): string {
  if (typeof (window as any).t === 'function') {
    const s = (window as any).t(key);
    if (s && s !== key) return s;
  }
  return fallback;
}

function _currentMode(): string {
  return (window as any).appMode === 'tutor' ? 'tutor' : 'chat';
}

function _setOpen(open: boolean): void {
  const wrap = document.getElementById('mobileMode');
  if (!wrap) return;
  wrap.setAttribute('data-open', open ? 'true' : 'false');
  const trigger = document.getElementById('mobileModeTrigger');
  if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

export function syncMobileModeSwitch(): void {
  const mode = _currentMode();
  const key = mode === 'tutor' ? 'tutor.modeTutor' : 'tutor.modeChat';
  const label = document.getElementById('mobileModeLabel');
  if (label) {
    label.setAttribute('data-i18n-key', key);
    label.textContent = _t(key, mode === 'tutor' ? 'Tutor' : 'Chat');
  }
  document.querySelectorAll('#mobileModeMenu .mobile-mode-item').forEach(function (item) {
    item.classList.toggle('active', item.getAttribute('data-mode') === mode);
  });
}

export function toggleMobileModeMenu(): void {
  const wrap = document.getElementById('mobileMode');
  if (!wrap) return;
  _setOpen(wrap.getAttribute('data-open') !== 'true');
}

export function selectAppMode(mode: string): void {
  _setOpen(false);
  const target = mode === 'tutor' ? 'tutor' : 'chat';
  if (target !== _currentMode() && typeof (window as any).toggleAppMode === 'function') {
    (window as any).toggleAppMode();
  } else {
    syncMobileModeSwitch();
  }
}

/* P_hide-mode-switch-in-conversation — mirror toggleAppMode()'s
   inSession heuristic so the top-bar Chat/Tutor switch disappears at
   exactly the same moment the existing destructive-confirm kicks in. */
function _isConversationActive(): boolean {
  const state = (typeof window !== 'undefined') ? (window as any).state : null;
  if (!state) return false;
  if (state.topic) return true;
  if (state.kbNodes && state.kbNodes.length > 0) return true;
  if (state.phase === 'chat') return true;
  const msgList = (typeof document !== 'undefined') ? document.getElementById('msgList') : null;
  if (msgList && msgList.children.length > 0) return true;
  return false;
}

export function syncConversationActive(): void {
  const active = _isConversationActive();
  try {
    document.body.setAttribute('data-conversation-active', active ? 'true' : 'false');
  } catch (_) { /* noop */ }
}

/* P_hide-mode-switch-in-conversation — wire a MutationObserver on
   msgList so the body attribute flips automatically when messages are
   added or cleared. */
function _watchMsgList(): void {
  const msgList = document.getElementById('msgList');
  if (!msgList || typeof MutationObserver === 'undefined') return;
  try {
    new MutationObserver(function () {
      try { syncConversationActive(); } catch (_) { /* noop */ }
    }).observe(msgList, { childList: true });
  } catch (_) { /* noop */ }
}

/* Register window globals used by the inline onclick handlers in
   index.html, and wire outside-click / Escape to close the popover. */
if (typeof document !== 'undefined') {
  (window as any).toggleMobileModeMenu = toggleMobileModeMenu;
  (window as any).selectAppMode = selectAppMode;
  (window as any).syncMobileModeSwitch = syncMobileModeSwitch;
  (window as any).syncConversationActive = syncConversationActive;

  document.addEventListener('click', function (e: MouseEvent) {
    if (e.target && (e.target as HTMLElement).closest && (e.target as HTMLElement).closest('#mobileMode')) return;
    _setOpen(false);
  });
  document.addEventListener('keydown', function (e: KeyboardEvent) {
    if (e.key === 'Escape') _setOpen(false);
  });
  window.addEventListener('DOMContentLoaded', function () {
    try { syncMobileModeSwitch(); } catch (_) { /* noop */ }
    try { syncConversationActive(); } catch (_) { /* noop */ }
    _watchMsgList();
  });
  if (document.readyState !== 'loading') {
    try { syncMobileModeSwitch(); } catch (_) { /* noop */ }
    try { syncConversationActive(); } catch (_) { /* noop */ }
    _watchMsgList();
  }
}
