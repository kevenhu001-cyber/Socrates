/* ui/sidebarChrome.ts — extracted from main.js (B6 batch).
 * Sidebar chrome: mobile drawer dismissal and the native view-switch adapter.
 * React owns the search row, panel selection, and panel visibility.
 */
import { toggleSidebar } from '../sidebar/sidebar.service.ts';
import {
  setSidebarOpen,
  toggleSidebarPanelView,
  useSidebarStore,
} from '../sidebar/sidebar.store.ts';
import { renderRecents } from './recentsView.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


/* Mobile only: tap anywhere outside the sidebar (and outside the toggle
   button) to close it. On desktop the user controls the sidebar with the
   toggle button / ⌘B, and closing it on a click-outside would be
   unexpected. The backdrop is a sibling of the sidebar in the DOM and
   z-index 25; tapping it always closes the drawer on mobile. */
export function isMobileViewport() { return browserWindow.innerWidth < 768; }

/* Native web session bridge compatibility action. React owns the selected
   panel and its visibility; this adapter only updates the shared store. */
export function toggleSidebarView(view: string) {
  const next = toggleSidebarPanelView(view === 'knowledge' ? 'knowledge' : 'mistakes');
  if (next === 'recents') renderRecents();
}

function isInteractiveControl(target: Element): boolean {
  return Boolean(
    target.closest('#sidebar')
    || target.closest('.toggle-sidebar')
    || target.closest('#sessionContextMenu')
    || target.closest('input, textarea, select, button, a, [role=button], [role=option]')
  );
}

/* Sidebar persisted state + mobile drawer listeners. Called once from
   main.js at the same position the inline block used to run, so eval
   order is unchanged. */
export function initSidebarChrome() {
  const sidebar = document.getElementById('sidebar');
  try {
    const sbPref = localStorage.getItem('socrates-sb');
    /* Tablets and landscape phones sit between the phone drawer and a
       desktop rail: 769–1024px used to open with a 278px sidebar, leaving a
       509px conversation column. Default them to the 52px rail so the
       content keeps the width, and keep honouring an explicit preference. */
    const wantsCollapsed = sbPref === '0' || (sbPref === null && browserWindow.innerWidth < 1025);
    if (wantsCollapsed) {
      sidebar?.classList.add('collapsed');
    }
  } catch (error) { reportSwallow(error, 'ui/sidebarChrome.ts:111', 'expected'); }
  const open = sidebar ? !sidebar.classList.contains('collapsed') : useSidebarStore.getState().isOpen;
  setSidebarOpen(open);

  document.addEventListener('click', function (e) {
    const sbEl = sidebar ?? document.getElementById('sidebar');
    if (!sbEl || sbEl.classList.contains('collapsed') || sbEl.classList.contains('ctx-menu-block')) return;
    const target = (e.target as Element)?.closest ? (e.target as Element) : (e.target as Node)?.parentElement as Element | null;
    if (!target?.closest || isInteractiveControl(target)) return;
    if (isMobileViewport()) toggleSidebar();
  });
  /* Backdrop tap on mobile also closes. The document-level handler above
     already handles backdrop clicks (the backdrop is outside #sidebar, not
     a form control, and is inside the mobile viewport's click region), so
     this listener is intentionally a no-op for non-backdrop targets and
     simply guarded against double-firing. */
  const sbBackdrop = document.getElementById('sidebarBackdrop');
  if (sbBackdrop) sbBackdrop.addEventListener('click', function (e) { e.stopPropagation(); const sbEl = sidebar ?? document.getElementById('sidebar'); if (isMobileViewport() && sbEl && !sbEl.classList.contains('collapsed')) toggleSidebar(); });
}
