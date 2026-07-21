/* ui/mobileModeSwitch.js — mobile-only 对话/导师 (Chat/Tutor) switcher.
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
    /* toggleAppMode() flips between the two modes and re-syncs the UI
       (including this switch via providers.syncAppModeUI). It may await a
       confirm dialog when a live session is in progress. */
    window.toggleAppMode();
  } else {
    syncMobileModeSwitch();
  }
}

/* Register window globals used by the inline onclick handlers in
   index.html, and wire outside-click / Escape to close the popover. */
if (typeof document !== "undefined") {
  window.toggleMobileModeMenu = toggleMobileModeMenu;
  window.selectAppMode = selectAppMode;
  window.syncMobileModeSwitch = syncMobileModeSwitch;

  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("#mobileMode")) return;
    _setOpen(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") _setOpen(false);
  });
  window.addEventListener("DOMContentLoaded", function () {
    try { syncMobileModeSwitch(); } catch (_) {}
  });
  if (document.readyState !== "loading") {
    try { syncMobileModeSwitch(); } catch (_) {}
  }
}
