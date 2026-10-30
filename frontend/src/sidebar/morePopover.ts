/* ── Sidebar "More" popover (PR-A) ──
   Anchored popover menu that opens above the #navMore button. Holds
   5 menu items:
     - Skills & shortcuts   → openPromptTemplatesModal
     - API settings         → openSettings
     - Display & theme      → toggleDisplayPrefs (existing popover)
     - Keyboard shortcuts   → openCheatsheet
     - Sign out             → signOut (after confirm)

   The pattern is copied from `toggleDisplayPrefs()` in
   src/displayPrefs.ts:262-297:
     - button position via getBoundingClientRect()
     - position:fixed so the popover can overflow the sidebar
     - capture-phase click listener attached in setTimeout(0) so
       the opening click doesn't immediately close it
     - Esc key closes

   The popover element is a static div in index.html (id="moreNavPopover",
   class="sidebar-more-popover hidden"). Its menu items have their own
   onclick attributes that resolve via window.* (bridged through
   windowExports.js) — that's what inline-handlers.spec.mjs verifies.

   Open/close changes publish to a module-owned state store so the React
   menu can refresh translated rows without a window bridge. */

import { restingRect } from "../ui/pressFeedback.ts";
import { publishMorePopoverState } from "../ui/morePopoverState.ts";
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";
import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';


const POPOVER_ID = "moreNavPopover";
const BTN_ID = "navMore";
type MorePopoverElement = HTMLElement & {
  __onDoc?: ((event: Event) => void) | null;
  __onEsc?: ((event: KeyboardEvent) => void) | null;
};

function _popover() { return document.getElementById(POPOVER_ID) as MorePopoverElement | null; }
function _button() { return document.getElementById(BTN_ID); }

function _isOpen(p: HTMLElement) { return p && !p.classList.contains("hidden"); }

/* The DOM class remains the visibility owner; React subscribes to this
   module-owned state to refresh translated menu labels on open/close. */
function _publishMorePopover(isOpen: boolean) {
  try {
    publishMorePopoverState(!!isOpen);
  } catch (error) {
    reportEmptyCatch(error, 'sidebar/morePopover.publish', 'expected');
    /* State notification is best-effort; the DOM visibility change stands. */
  }
}

/* Compute the popover's position from the More button. The popover is
   right-aligned to the button and prefers to open upward (matching the
   display-prefs popover), but flips below the button when there is not
   enough room above it. Falls back to sensible defaults if the button is
   missing.

   The flip is not cosmetic: #navMore sits near the top of the sidebar, so a
   menu that could only grow upward slid off the top of the viewport as soon
   as it gained an item, leaving every row unclickable. Requires the popover
   to be visible already so offsetHeight is real — see toggleMorePopover. */
const GAP = 8;

function _popoverWidth(p: Element) {
  /* Width matches the popover's CSS (220px). Read it from computed
     style if available; fall back to the CSS-defined minimum. */
  let popW = 220;
  try {
    const cs = browserWindow.getComputedStyle(p);
    if (cs && cs.minWidth) {
      const n = parseInt(cs.minWidth, 10);
      if (!isNaN(n) && n > 0) popW = n;
    }
  } catch (_) {
    reportEmptyCatch(_, 'empty catch: sidebar/morePopover.ts:81', 'expected');
    /* ignore */
  }
  return popW;
}

function _positionHorizontally(p: { style: { left: string; right: string; }; }, r: { right: number; }, popW: number) {
  let left = r.right - popW;
  const maxLeft = browserWindow.innerWidth - popW - GAP;
  if (maxLeft >= GAP && left > maxLeft) left = maxLeft;
  if (left < GAP) left = GAP;
  p.style.left = left + "px";
  p.style.right = "auto";
}

function _positionVertically(p: { offsetHeight: number; style: { top: string; bottom: string; }; }, r: { top: number; bottom: number; }) {
  const h = p.offsetHeight || 0;
  if (h > 0 && r.top - GAP - h < GAP) {
    let top = r.bottom + GAP;
    const maxTop = browserWindow.innerHeight - h - GAP;
    if (maxTop >= GAP && top > maxTop) top = maxTop;
    if (top < GAP) top = GAP;
    p.style.top = top + "px";
    p.style.bottom = "auto";
  } else {
    p.style.bottom = (browserWindow.innerHeight - r.top + GAP) + "px";
    p.style.top = "auto";
  }
}

function _position(p: HTMLElement, btn: HTMLElement|null) {
  if (!btn) return;
  const r = restingRect(btn); /* not the mid-press box (ui/pressFeedback.ts) */
  _positionHorizontally(p, r, _popoverWidth(p));
  _positionVertically(p, r);
}

/* Close the popover and remove the outside-click + Esc listeners. */
function _close(p: MorePopoverElement|null) {
  if (!p) return;
  p.classList.add("hidden");
  if (p.__onDoc) document.removeEventListener("click", p.__onDoc, true);
  if (p.__onEsc) document.removeEventListener("keydown", p.__onEsc, true);
  p.__onDoc = null;
  p.__onEsc = null;
  _publishMorePopover(false);
}

/* toggleMorePopover — open if closed, close if open. Bound to
   the More nav button's onclick as `openMoreNav()`. */
export function toggleMorePopover() {
  const p = _popover();
  if (!p) return;
  if (_isOpen(p)) { _close(p); return; }
  const btn = _button();
  /* Unhide before measuring: _position needs a real offsetHeight to decide
     whether the menu fits above the button. Both happen in the same frame,
     so nothing paints at the stale position. */
  p.classList.remove("hidden");
  _position(p, btn);
  _publishMorePopover(true);
  /* Defer outside-click + Esc listeners by one tick so the opening
     click doesn't immediately close the popover. */
  setTimeout(function () {
    function onDoc(e: Event) {
      if (p!.contains((e.target as Node | null))) return;
      if (btn && btn.contains((e.target as Node | null))) return;
      _close(p);
    }
    function onEsc(e: KeyboardEvent) {
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
