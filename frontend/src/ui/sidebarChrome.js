/* ui/sidebarChrome.js — extracted from main.js (B6 batch).
 * Sidebar chrome: open/close buttons, mobile drawer listeners, backdrop,
 * tab switching, sidebar view toggle. Zero-behavior-change lift.
 * Recents/mistakes render surfaces resolve via window.* (main.js-owned).
 */
import { toggleSidebar } from '../sidebar/index.js';
import { renderKnowledgeView } from './knowledgeView.js';

export var sidebarOpen = true;

function _renderRecents() {
  try { if (typeof window !== 'undefined' && typeof window.renderRecents === 'function') window.renderRecents(); } catch (_) {}
}
function _renderMistakes() {
  try { if (typeof window !== 'undefined' && typeof window.renderMistakes === 'function') window.renderMistakes(); } catch (_) {}
}

export function syncSidebarBtns() {
  var ob = document.getElementById('sidebarOpenBtn');
  var cb = document.getElementById('sidebarCloseBtn');
  /* Derive from the DOM (.collapsed) — toggleSidebar() lives in
     sidebar/index.js and can't write this module's `sidebarOpen`
     var, so reading the var here would desync after the first toggle. */
  var s = document.getElementById('sidebar');
  var open = s ? !s.classList.contains('collapsed') : sidebarOpen;
  /* Keep the top-bar toggle button hidden when sidebar is open
     (the close button inside the sidebar header is visible then).
     Show the toggle button only when sidebar is collapsed so the
     user always has an obvious way to re-open it. */
  if (ob) {
    ob.style.display = open ? 'none' : '';
    ob.setAttribute('aria-expanded', open ? 'true' : 'false');
    ob.setAttribute('aria-label', open ? 'Collapse sidebar' : 'Expand sidebar');
    ob.setAttribute('title', open ? 'Collapse sidebar (⌘B)' : 'Expand sidebar (⌘B)');
  }
  /* The close button inside the sidebar header is only useful when
     the sidebar is open. Hidden when collapsed so it drops out of
     the tab order. */
  if (cb) {
    cb.style.display = open ? '' : 'none';
    if (open) cb.removeAttribute('aria-hidden');
    else cb.setAttribute('aria-hidden', 'true');
  }
}

/* Mobile only: tap anywhere outside the sidebar (and outside the toggle
   button) to close it. On desktop the user controls the sidebar with the
   toggle button / ⌘B, and closing it on a click-outside would be
   unexpected. The backdrop is a sibling of the sidebar in the DOM and
   z-index 25; tapping it always closes the drawer on mobile. */
export function isMobileViewport() { return window.innerWidth < 768; }

export function switchTab(tab) {
  var tk = document.getElementById('tabKnowledge'); if (tk) tk.classList.toggle('active', tab === 'knowledge');
  var tr = document.getElementById('tabRecents'); if (tr) tr.classList.toggle('active', tab === 'recents');
  var mt = document.getElementById('tabMistakes');
  if (mt) mt.classList.toggle('active', tab === 'mistakes');
  var kp = document.getElementById('knowledgePanel'); if (kp) kp.classList.toggle('hidden', tab !== 'knowledge');
  var rp = document.getElementById('recentsPanel'); if (rp) rp.classList.toggle('hidden', tab !== 'recents');
  var mp = document.getElementById('mistakesPanel');
  if (mp) mp.classList.toggle('hidden', tab !== 'mistakes');
  if (tab === 'recents') _renderRecents();
  if (tab === 'mistakes') _renderMistakes();
  /* Task 3.3 — refresh the teaching-plan view whenever the
     Knowledge tab is shown, so the stage / current sub-topic
     stay in sync after in-chat advances. */
  if (tab === 'knowledge') renderKnowledgeView();
}

/* Sidebar view switch used by the tutor-only Knowledge / Mistakes icon
   entries. Clicking an already-active view toggles back to the unified
   Recents list; otherwise it opens the requested view. switchTab owns
   the actual panel show/hide. */
export function toggleSidebarView(view) {
  var el = document.getElementById(view === 'knowledge' ? 'tabKnowledge' : 'tabMistakes');
  var isActive = el && el.classList.contains('active');
  switchTab(isActive ? 'recents' : view);
}

/* Sidebar persisted state + mobile drawer listeners. Called once from
   main.js at the same position the inline block used to run, so eval
   order is unchanged. */
export function initSidebarChrome() {
  try {
    var sbPref = localStorage.getItem('socrates-sb');
    if (sbPref === '0' || (sbPref === null && window.innerWidth < 768)) {
      sidebarOpen = false; document.getElementById('sidebar').classList.add('collapsed');
    }
  } catch (_) {}
  syncSidebarBtns();
  try { window.sidebarOpen = sidebarOpen; } catch (_) {}

  document.addEventListener('click', function (e) {
    var sbEl = document.getElementById('sidebar');
    if (!sbEl || sbEl.classList.contains('collapsed')) return;
    /* Clicks inside the sidebar or on the toggle button are not "outside". */
    if (e.target.closest('#sidebar')) return;
    if (e.target.closest('.toggle-sidebar')) return;
    /* If the context menu is open (long-press on a recent item), do NOT
       close the sidebar. The context menu popover lives outside #sidebar
       (appended to document.body), so it is not caught by the #sidebar
       guard above. Tapping on the context menu or its label input should
       not collapse the sidebar. */
    if (e.target.closest('#sessionContextMenu')) return;
    /* If ctx-menu-block is active, the user just long-pressed a recent
       item. The synthetic click event that follows has its target resolved
       outside .recent-item (because pointer-events:none), so the #sidebar
       guard above does not catch it. Ignore all clicks while the block
       class is present. */
    if (sbEl.classList.contains('ctx-menu-block')) return;
    /* Don't fight the user when they're interacting with form fields, the
       model picker, the extensions picker, or any other transient menu.
       If the click target is inside an open dropdown / form / modal
       overlay, leave the sidebar alone — the user is clearly in
       a nested interaction. */
    if (e.target.closest('.model-picker-menu')) return;
    if (e.target.closest('.extensions-menu')) return;
    if (e.target.closest('.model-picker, .extensions-picker')) return;
    if (e.target.closest('input, textarea, select, button, a, [role=button], [role=option]')) {
      /* It's a control that may have its own click handler. Don't second-guess
         it. The sidebar will close naturally if the tap ends up doing nothing. */
      return;
    }
    if (isMobileViewport()) toggleSidebar();
  });
  /* Backdrop tap on mobile also closes. The document-level handler above
     already handles backdrop clicks (the backdrop is outside #sidebar, not
     a form control, and is inside the mobile viewport's click region), so
     this listener is intentionally a no-op for non-backdrop targets and
     simply guarded against double-firing. */
  var sbBackdrop = document.getElementById('sidebarBackdrop');
  if (sbBackdrop) sbBackdrop.addEventListener('click', function (e) { e.stopPropagation(); var sbEl = document.getElementById('sidebar'); if (isMobileViewport() && sbEl && !sbEl.classList.contains('collapsed')) toggleSidebar(); });
}
