/* ── Sidebar "More" popover (PR-A) ──
   Anchored popover menu that opens above the #navMore button. Holds
   5 menu items:
     - Skills & shortcuts   → openPromptTemplatesModal
     - API settings         → openSettings
     - Display & theme      → toggleDisplayPrefs (existing popover)
     - Keyboard shortcuts   → openCheatsheet
     - Sign out             → signOut (after confirm)

   The pattern is copied from `toggleDisplayPrefs()` in
   src/displayPrefs.js:262-297:
     - button position via getBoundingClientRect()
     - position:fixed so the popover can overflow the sidebar
     - capture-phase click listener attached in setTimeout(0) so
       the opening click doesn't immediately close it
     - Esc key closes

   The popover element is a static div in index.html (id="moreNavPopover",
   class="sidebar-more-popover hidden"). Its menu items have their own
   onclick attributes that resolve via window.* (bridged through
   windowExports.js) — that's what inline-handlers.spec.mjs verifies.

   React migration bridge — fires whenever the popover opens/closes so
   the React compatibility root can subscribe via useSyncExternalStore.
   Installed by frontend/src/react/morePopover/morePopoverStore.ts under
   `?react=1`; legacy mode never sees a subscriber so the helper is a
   cheap no-op. */

var POPOVER_ID = "moreNavPopover";
var BTN_ID = "navMore";

function _popover() { return document.getElementById(POPOVER_ID); }
function _button() { return document.getElementById(BTN_ID); }

function _isOpen(p) { return p && !p.classList.contains("hidden"); }

/* React migration bridge — fires whenever the popover opens/closes so
   the React compatibility root can mirror the menu via useSyncExternalStore.
   Installed by frontend/src/react/morePopover/morePopoverStore.ts under
   `?react=1`; legacy mode never sees a subscriber so the helper is a
   cheap no-op. */
function _publishMorePopover(isOpen) {
  try {
    var bridge = window.__socratesMorePopoverBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({ isOpen: !!isOpen });
    }
  } catch (_) { /* swallow — bridge is best-effort */ }
}

/* Compute the popover's position from the More button. The popover is
   right-aligned to the button and opens upward (matches the
   display-prefs popover behavior). Falls back to sensible defaults
   if the button is missing. */
function _position(p, btn) {
  if (!btn) return;
  var r = btn.getBoundingClientRect();
  /* Width matches the popover's CSS (220px). Read it from computed
     style if available; fall back to the CSS-defined minimum. */
  var popW = 220;
  try {
    var cs = window.getComputedStyle(p);
    if (cs && cs.minWidth) {
      var n = parseInt(cs.minWidth, 10);
      if (!isNaN(n) && n > 0) popW = n;
    }
  } catch (_) { /* ignore */ }
  var left = r.right - popW;
  if (left < 8) left = 8;
  var bottom = window.innerHeight - r.top + 8;
  p.style.left = left + "px";
  p.style.bottom = bottom + "px";
  p.style.right = "auto";
  p.style.top = "auto";
}

/* Close the popover and remove the outside-click + Esc listeners. */
function _close(p) {
  if (!p) return;
  p.classList.add("hidden");
  document.removeEventListener("click", p.__onDoc, true);
  document.removeEventListener("keydown", p.__onEsc, true);
  p.__onDoc = null;
  p.__onEsc = null;
  /* Clear the active state on the More button via the nav
     dispatcher. We can't import setActiveNav here without a cycle,
     so we reach it through window (windowExports.js attaches it). */
  try {
    if (typeof window.setActiveNav === "function") window.setActiveNav(null);
  } catch (_) { /* ignore */ }
  _publishMorePopover(false);
}

/* toggleMorePopover — open if closed, close if open. Bound to
   the More nav button's onclick as `openMoreNav()`. */
export function toggleMorePopover() {
  var p = _popover();
  if (!p) return;
  if (_isOpen(p)) { _close(p); return; }
  var btn = _button();
  _position(p, btn);
  p.classList.remove("hidden");
  _publishMorePopover(true);
  /* Defer outside-click + Esc listeners by one tick so the opening
     click doesn't immediately close the popover. */
  setTimeout(function () {
    function onDoc(e) {
      if (p.contains(e.target)) return;
      if (btn && btn.contains(e.target)) return;
      _close(p);
    }
    function onEsc(e) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      _close(p);
    }
    p.__onDoc = onDoc;
    p.__onEsc = onEsc;
    document.addEventListener("click", onDoc, true);
    document.addEventListener("keydown", onEsc, true);
  }, 0);
}

/* closeMorePopover — exposed for the menu items' onclick handlers
   that need to dismiss the popover before navigating away (e.g.
   Sign out). The menu items still call _close() inline where it's
   simple, but this gives a single entry point. */
export function closeMorePopover() {
  _close(_popover());
}
