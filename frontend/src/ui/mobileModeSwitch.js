import { stateStore } from '../state/store.js';
import { syncSocraticMasteryUI } from '../tutor/socraticMastery.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

/* ui/mobileModeSwitch.js — bridges shadcn's desktop/mobile mode controls.
 *
 * TopBar renders a shadcn Tabs control on desktop and DropdownMenu on phones.
 * Both dispatch mode intent here so the existing confirmation flow remains
 * authoritative. This module keeps both controls synchronized:
 *
 *   - toggleMobileModeMenu()  opens the mobile DropdownMenu trigger
 *   - selectAppMode(mode)     switches mode via window.toggleAppMode()
 *   - syncMobileModeSwitch()  publishes mode for both React controls;
 *                             called from providers.js syncAppModeUI().
 *
 * The mobile popover animation is CSS-driven off [data-open] on #mobileMode.
 * `_applyModeSwitchVisibility` hides both controls during a live conversation.
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
    label.removeAttribute("data-i18n-key");
    label.textContent = mode === "tutor" ? _t(key, "Tutor") : "Socrates";
  }
  document.dispatchEvent(new CustomEvent("socrates:mobile-mode-sync", { detail: mode }));
  syncTopModeSwitch();
}

/* P_mode-segment-top — the desktop header's segmented control. It reads the
   same `appMode` the dropdown does, so the two stay in sync. The tabs own
   their selected visual state and roving focus. */
function syncTopModeSwitch() {
  try { syncSocraticMasteryUI(); } catch (_) { /* empty-catch: intentional — socratic mastery sync is best-effort */ }
}

/** Select a mode requested by a shadcn Tabs or RadioGroup control. */
function selectTopMode(mode) {
  if (mode === _currentMode()) return;
  selectAppMode(mode);
}

export function toggleMobileModeMenu() {
  var trigger = document.getElementById("mobileModeTrigger");
  if (trigger) trigger.click();
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
  if (msgList) {
    /* First real child decides it — no need to copy the whole list. */
    for (var c = msgList.firstElementChild; c; c = c.nextElementSibling) {
      if (!c.hasAttribute('data-react-message-list-empty')) return true;
    }
  }
  return false;
}

var _lastActive = null;

export function syncConversationActive() {
  var active = _isConversationActive();
  /* P_mode-switch-cheap — this runs on every #msgList child mutation (each
     history chunk, each sent message). Nothing to do when the answer did not
     change. */
  if (active === _lastActive) return;
  _lastActive = active;
  try {
    document.body.setAttribute("data-conversation-active", active ? "true" : "false");
  } catch (error) { reportSwallow(error, 'ui/mobileModeSwitch.js:149'); }
  /* P_hide-mode-switch-in-conversation — inline-style fallback. CSS
     specificity wars with the cowork theme make a pure-CSS rule
     fragile (the cowork mobile block re-asserts display:flex with
     !important on the same selectors). Setting the inline style
     directly here is the final authority: no cowork rule can beat
     an inline display:none !important. */
  _applyModeSwitchVisibility(active);
  try { syncSocraticMasteryUI(); } catch (_) { /* empty-catch: intentional — socratic mastery sync on conversation toggle is best-effort */ }
}

function _applyModeSwitchVisibility(hidden) {
  /* Both mode controls are hidden for the duration of a live conversation:
     the phone dropdown (#mobileMode) and the desktop header pill
     (#topModeSwitch). They read the same appMode and sit on opposite
     viewports, so hiding one without the other would leave a control the
     reader can click that can only destroy the conversation in progress.

     Each is a direct id lookup rather than a selector LIST (a list has no id
     fast path in Blink and walks the whole document — tens of thousands of
     nodes once a long transcript is mounted). */
  var el = document.getElementById("mobileMode");
  if (el) {
    try {
      el.style.setProperty("display", hidden ? "none" : "", "important");
    } catch (error) { reportSwallow(error, 'ui/mobileModeSwitch.js:174'); }
  }
  var top = document.getElementById("topModeSwitch");
  if (top) {
    try {
      /* The header pill is normally laid out by parity/topbar.css, which also
         hides it on phones. An inline `display:none !important` beats that
         media query without a second owner for the same rule. */
      top.style.setProperty("display", hidden ? "none" : "", "important");
    } catch (error) { reportSwallow(error, 'ui/mobileModeSwitch.js:183'); }
  }
}

/* P_hide-mode-switch-in-conversation — wire a MutationObserver on
   msgList so the body attribute flips automatically when messages are
   added or cleared (covers loadSession, resetApp, appendMessage). */
var _watching = false;
function _watchMsgList() {
  var msgList = document.getElementById("msgList");
  /* Both the DOMContentLoaded listener and the readyState branch below can
     run for a module script, which used to install two observers. */
  if (_watching || !msgList || typeof MutationObserver === "undefined") return;
  _watching = true;
  try {
    new MutationObserver(function () {
      try { syncConversationActive(); } catch (error) { reportSwallow(error, 'ui/mobileModeSwitch.js:199'); }
    }).observe(msgList, { childList: true });
  } catch (error) { reportSwallow(error, 'ui/mobileModeSwitch.js:201'); }
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

  /* The React Tabs and RadioGroup controls dispatch intent; this adapter
     preserves the existing confirmation and app-mode transition flow. */
  document.addEventListener("socrates:mode-switch-select", function (event) {
    var mode = event.detail;
    if (mode === "chat" || mode === "tutor") selectTopMode(mode);
  });

  window.addEventListener("DOMContentLoaded", function () {
    try { syncMobileModeSwitch(); } catch (error) { reportSwallow(error, 'ui/mobileModeSwitch.js:250'); }
    try { syncConversationActive(); } catch (error) { reportSwallow(error, 'ui/mobileModeSwitch.js:251'); }
    _watchMsgList();
  });
  if (document.readyState !== "loading") {
    try { syncMobileModeSwitch(); } catch (error) { reportSwallow(error, 'ui/mobileModeSwitch.js:255'); }
    try { syncConversationActive(); } catch (error) { reportSwallow(error, 'ui/mobileModeSwitch.js:256'); }
    _watchMsgList();
  }
}
