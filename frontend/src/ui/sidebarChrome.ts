/* ui/sidebarChrome.ts — extracted from main.js (B6 batch).
 * Sidebar chrome: open/close buttons, mobile drawer listeners, backdrop,
 * tab switching, sidebar view toggle. Zero-behavior-change lift.
 * Recents/mistakes render surfaces resolve via window.* (main.js-owned).
 */
import { toggleSidebar } from '../sidebar/sidebar.service.ts';
import { renderKnowledgeView } from './knowledgeView.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


export let sidebarOpen = true;

function _renderRecents() {
  try { if (typeof window !== 'undefined' && typeof browserWindow.renderRecents === 'function') browserWindow.renderRecents(); } catch (error) { reportSwallow(error, 'ui/sidebarChrome.ts:12'); }
}
function _renderMistakes() {
  try { if (typeof window !== 'undefined' && typeof browserWindow.renderMistakes === 'function') browserWindow.renderMistakes(); } catch (error) { reportSwallow(error, 'ui/sidebarChrome.ts:15'); }
}
/* Localize the sidebar toggle copy. `window.t` is installed by i18n.ts at
   boot; fall back to the English string so a pre-i18n paint still reads. */
function _tr(key: string, fallback: string) {
  try { if (typeof window !== 'undefined' && typeof browserWindow.t === 'function') { const v = browserWindow.t(key); if (v && v !== key) return v; } } catch (error) { reportSwallow(error, 'ui/sidebarChrome.ts:20'); }
  return fallback;
}

function syncDesktopSidebarButtons(ob: HTMLElement|null, cb: HTMLElement|null, open: boolean) {
  /* Desktop collapses to chatgpt.com's 52px icon rail (styles/parity/
     sidebar.css): the rail keeps its own toggle, so the header button stays
     reachable in both states and the top-bar opener is never needed. */
  if (ob) {
    ob.style.display = 'none';
    ob.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (!cb) return;
  cb.style.display = '';
  cb.removeAttribute('aria-hidden');
  cb.setAttribute('aria-expanded', open ? 'true' : 'false');
  cb.setAttribute('aria-label', _tr(open ? 'chrome.closeSidebar' : 'chrome.openSidebar', open ? 'Close sidebar' : 'Open sidebar'));
  cb.setAttribute('title', _tr(open ? 'chrome.closeSidebarKbd' : 'chrome.openSidebarKbd', open ? 'Close sidebar (⌘B)' : 'Open sidebar (⌘B)'));
}

function syncMobileSidebarButtons(ob: HTMLElement|null, cb: HTMLElement|null, open: boolean) {
  /* Keep the top-bar toggle button hidden when sidebar is open
     (the close button inside the sidebar header is visible then).
     Show the toggle button only when sidebar is collapsed so the
     user always has an obvious way to re-open it. */
  if (ob) {
    ob.style.display = open ? 'none' : '';
    ob.setAttribute('aria-expanded', open ? 'true' : 'false');
    ob.setAttribute('aria-label', _tr(open ? 'chrome.collapseSidebar' : 'chrome.expandSidebar', open ? 'Collapse sidebar' : 'Expand sidebar'));
    ob.setAttribute('title', _tr(open ? 'chrome.collapseSidebarKbd' : 'chrome.expandSidebarKbd', open ? 'Collapse sidebar (⌘B)' : 'Expand sidebar (⌘B)'));
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

export function syncSidebarBtns() {
  const ob = document.getElementById('sidebarOpenBtn');
  const cb = document.getElementById('sidebarCloseBtn');
  /* Derive from the DOM (.collapsed) — toggleSidebar() lives in
     sidebar/sidebar.service.ts and can't write this module's `sidebarOpen`
     var, so reading the var here would desync after the first toggle. */
  const sidebar = document.getElementById('sidebar');
  const open = sidebar ? !sidebar.classList.contains('collapsed') : sidebarOpen;
  if (isMobileViewport()) syncMobileSidebarButtons(ob, cb, open);
  else syncDesktopSidebarButtons(ob, cb, open);
}

/* Mobile only: tap anywhere outside the sidebar (and outside the toggle
   button) to close it. On desktop the user controls the sidebar with the
   toggle button / ⌘B, and closing it on a click-outside would be
   unexpected. The backdrop is a sibling of the sidebar in the DOM and
   z-index 25; tapping it always closes the drawer on mobile. */
export function isMobileViewport() { return browserWindow.innerWidth < 768; }

export function switchTab(tab: string) {
  const tk = document.getElementById('tabKnowledge'); if (tk) tk.classList.toggle('active', tab === 'knowledge');
  const mt = document.getElementById('tabMistakes');
  if (mt) mt.classList.toggle('active', tab === 'mistakes');
  const kp = document.getElementById('knowledgePanel'); if (kp) kp.classList.toggle('hidden', tab !== 'knowledge');
  const rp = document.getElementById('recentsPanel'); if (rp) rp.classList.toggle('hidden', tab !== 'recents');
  const mp = document.getElementById('mistakesPanel');
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
export function toggleSidebarView(view: string) {
  const el = document.getElementById(view === 'knowledge' ? 'tabKnowledge' : 'tabMistakes');
  const isActive = el && el.classList.contains('active');
  switchTab(isActive ? 'recents' : view);
}

/* Sidebar persisted state + mobile drawer listeners. Called once from
   main.js at the same position the inline block used to run, so eval
   order is unchanged. */
export function initSidebarChrome() {
  try {
    const sbPref = localStorage.getItem('socrates-sb');
    /* Tablets and landscape phones sit between the phone drawer and a
       desktop rail: 769–1024px used to open with a 278px sidebar, leaving a
       509px conversation column. Default them to the 52px rail so the
       content keeps the width, and keep honouring an explicit preference. */
    const wantsCollapsed = sbPref === '0' || (sbPref === null && browserWindow.innerWidth < 1025);
    if (wantsCollapsed) {
      sidebarOpen = false; document.getElementById('sidebar')!.classList.add('collapsed');
    }
  } catch (error) { reportSwallow(error, 'ui/sidebarChrome.ts:111', 'expected'); }
  syncSidebarBtns();
  /* Re-localize the JS-owned toggle copy whenever the language changes. It
     carries the state-dependent ⌘B hint, so it is written by
     syncSidebarBtns() rather than a static data-i18n hook; without this the
     title would stay in the previous language until the sidebar is toggled. */
  document.addEventListener('socrates:langchange', syncSidebarBtns);
  try { browserWindow.sidebarOpen = sidebarOpen; } catch (error) { reportSwallow(error, 'ui/sidebarChrome.ts:118'); }

  document.addEventListener('click', function (e) {
    const sbEl = document.getElementById('sidebar');
    if (!sbEl || sbEl.classList.contains('collapsed')) return;
    /* Clicks inside the sidebar or on the toggle button are not "outside". */
    if ((e.target as Element)!.closest('#sidebar')) return;
    if ((e.target as Element)!.closest('.toggle-sidebar')) return;
    /* If the context menu is open (long-press on a recent item), do NOT
       close the sidebar. The context menu popover lives outside #sidebar
       (appended to document.body), so it is not caught by the #sidebar
       guard above. Tapping on the context menu or its label input should
       not collapse the sidebar. */
    if ((e.target as Element)!.closest('#sessionContextMenu')) return;
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
    if ((e.target as Element)!.closest('.model-picker-menu')) return;
    if ((e.target as Element)!.closest('.extensions-menu')) return;
    if ((e.target as Element)!.closest('.model-picker, .extensions-picker')) return;
    if ((e.target as Element)!.closest('input, textarea, select, button, a, [role=button], [role=option]')) {
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
  const sbBackdrop = document.getElementById('sidebarBackdrop');
  if (sbBackdrop) sbBackdrop.addEventListener('click', function (e) { e.stopPropagation(); const sbEl = document.getElementById('sidebar'); if (isMobileViewport() && sbEl && !sbEl.classList.contains('collapsed')) toggleSidebar(); });
}
