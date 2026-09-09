import { stateStore } from '../state/store.js';

/* ui/mobileModeSwitch.js — mobile-only 对话/导师 (Chat/Tutor) switcher.
 *
 * P_mobile-topbar. The compact segmented pill (#modeSegmentedTop) is now the
 * primary control on both desktop and phone landing surfaces. This module
 * keeps the legacy "Chat ˅" dropdown synchronized for fallback states and
 * accessibility:
 *
 *   - toggleMobileModeMenu()  opens/closes the popover (#mobileModeMenu)
 *   - selectAppMode(mode)     switches mode via window.toggleAppMode()
 *   - syncMobileModeSwitch()  refreshes the trigger label + active item;
 *                             called from providers.js syncAppModeUI().
 *
 * The popover animation is CSS-driven off [data-open] on #mobileMode; we
 * only flip that attribute + aria-expanded here.
 */

function _t(key, fallback) {
  if (typeof window.t === "function") {
    var s = window.t(key);
    if (s && s !== key) return s;
  }
  return fallback;
}

function _currentMode() {
  return window.appMode === "tutor" ? "tutor" : "chat";
}

function _setOpen(open) {
  var wrap = document.getElementById("mobileMode");
  if (!wrap) return;
  wrap.setAttribute("data-open", open ? "true" : "false");
  var trigger = document.getElementById("mobileModeTrigger");
  if (trigger) trigger.setAttribute("aria-expanded", open ? "true" : "false");
}

export function syncMobileModeSwitch() {
  var mode = _currentMode();
  var key = mode === "tutor" ? "tutor.modeTutor" : "tutor.modeChat";
  var label = document.getElementById("mobileModeLabel");
  if (label) {
    label.setAttribute("data-i18n-key", key);
    label.textContent = _t(key, mode === "tutor" ? "Tutor" : "Chat");
  }
  document.querySelectorAll("#mobileModeMenu .mobile-mode-item").forEach(function (item) {
    item.classList.toggle("active", item.getAttribute("data-mode") === mode);
  });
}

export function toggleMobileModeMenu() {
  var wrap = document.getElementById("mobileMode");
  if (!wrap) return;
  _setOpen(wrap.getAttribute("data-open") !== "true");
}

export function selectAppMode(mode) {
  _setOpen(false);
  var target = mode === "tutor" ? "tutor" : "chat";
  if (target !== _currentMode() && typeof window.toggleAppMode === "function") {
    /* Pass the clicked target explicitly. This keeps the interaction tied to
       the selected position even if mode state changes before the async
       confirmation completes. */
    window.toggleAppMode(target);
  } else {
    syncMobileModeSwitch();
  }
}

/* P_hide-mode-switch-in-conversation — mirror toggleAppMode()'s
   inSession heuristic so the top-bar Chat/Tutor switch disappears at
   exactly the same moment the existing destructive-confirm kicks in.
   Triggers on any of: state.topic set, kbNodes populated,
   state.phase==="chat", or any child inside #msgList. State changes
   that don't touch msgList (e.g. setting a topic) are caught when
   callers invoke this via syncAppModeUI() / resetApp() — the
   MutationObserver on msgList covers the message-driven path.

   P_hide-mode-switch-reappears — the visibility is derived purely
   from the current session state, never latched. The user can pick
   Chat or Tutor again every time they land on the topic-input page
   (fresh load, after "New chat", after exiting a workspace), and the
   pill hides only while a conversation is actually in progress. This
   is the pre-flight contract: the toggle is a per-conversation
   choice, not a once-per-page one. */

function _isConversationActive() {
  if (stateStore.read('topic')) return true;
  var kbNodes = stateStore.read('kbNodes');
  if (kbNodes && kbNodes.length > 0) return true;
  if (stateStore.read('phase') === "chat") return true;
  var msgList = (typeof document !== "undefined") ? document.getElementById("msgList") : null;
  /* React's MessageList always renders an empty placeholder
     (<div data-react-message-list-empty>) in #msgList even when there
     are no messages, so msgList.children.length > 0 is always true
     after React mounts. Skip the placeholder when checking for real
     conversation messages. */
  if (msgList && Array.from(msgList.children).some(function (c) { return !c.hasAttribute('data-react-message-list-empty'); })) return true;
  return false;
}

export function syncConversationActive() {
  var active = _isConversationActive();
  try {
    document.body.setAttribute("data-conversation-active", active ? "true" : "false");
  } catch (_) {}
  /* P_hide-mode-switch-in-conversation — inline-style fallback. CSS
     specificity wars with the cowork theme make a pure-CSS rule
     fragile (the cowork mobile block re-asserts display:flex with
     !important on the same selectors). Setting the inline style
     directly here is the final authority: no cowork rule can beat
     an inline display:none !important. */
  _applyModeSwitchVisibility(active);
}

function _applyModeSwitchVisibility(hidden) {
  var els = document.querySelectorAll("#modeSegmentedTop, #mobileMode");
  for (var i = 0; i < els.length; i++) {
    try {
      els[i].style.setProperty("display", hidden ? "none" : "", "important");
    } catch (_) {}
  }
}

/* P_hide-mode-switch-in-conversation — wire a MutationObserver on
   msgList so the body attribute flips automatically when messages are
   added or cleared (covers loadSession, resetApp, appendMessage). */
function _watchMsgList() {
  var msgList = document.getElementById("msgList");
  if (!msgList || typeof MutationObserver === "undefined") return;
  try {
    new MutationObserver(function () {
      try { syncConversationActive(); } catch (_) {}
    }).observe(msgList, { childList: true });
  } catch (_) {}
}

/* Register window globals used by the inline onclick handlers in
   index.html, and wire outside-click / Escape to close the popover. */
if (typeof document !== "undefined") {
  window.toggleMobileModeMenu = toggleMobileModeMenu;
  window.selectAppMode = selectAppMode;
  window.syncMobileModeSwitch = syncMobileModeSwitch;
  window.syncConversationActive = syncConversationActive;

  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("#mobileMode")) return;
    _setOpen(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") _setOpen(false);
  });
  window.addEventListener("DOMContentLoaded", function () {
    try { syncMobileModeSwitch(); } catch (_) {}
    try { syncConversationActive(); } catch (_) {}
    _watchMsgList();
  });
  if (document.readyState !== "loading") {
    try { syncMobileModeSwitch(); } catch (_) {}
    try { syncConversationActive(); } catch (_) {}
    _watchMsgList();
  }
}
