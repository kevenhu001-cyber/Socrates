import { bumpRecentsVersion, setSidebarOpen, setSidebarRecentsFilter, useSidebarStore } from './sidebar.store';
import { DESKTOP_VIEWPORT_MIN_PX, isMobileViewport } from './breakpoints.ts';
import { renderRecents } from '../ui/recentsView.ts';
import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';

const RECENTS_FILTER_KEY = 'socrates-recents-filter';
const SIDEBAR_SPATIAL_DURATION_MS = 180;
const SIDEBAR_SPATIAL_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

let mainShiftAnimation: Animation | null = null;
let sidebarRevealAnimation: Animation | null = null;

function storedRecentsFilter(): string | null {
  try { return localStorage.getItem(RECENTS_FILTER_KEY) || null; } catch { return null; }
}

function prefersReducedMotion(): boolean {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; }
  catch { return false; }
}

function cancelDesktopSidebarMotion(): void {
  mainShiftAnimation?.cancel();
  sidebarRevealAnimation?.cancel();
  mainShiftAnimation = null;
  sidebarRevealAnimation = null;
}

function mainSidebarInset(main: HTMLElement): number {
  const value = Number.parseFloat(getComputedStyle(main).paddingLeft);
  return Number.isFinite(value) ? value : 0;
}

function visibleMainOffset(main: HTMLElement | null): number {
  if (!main || !mainShiftAnimation) return 0;
  const transform = getComputedStyle(main).transform;
  return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41;
}

/**
 * Desktop open/close uses a FLIP-style compositor transition.
 *
 * polish/motion.css owns the cross-surface rule that disables the historical
 * width/padding transitions. The target geometry therefore commits once; this
 * service only measures the old/new inset and visually carries the main
 * surface across that jump with a transform.
 */
function animateDesktopSidebarMotion(
  sidebar: HTMLElement,
  main: HTMLElement,
  beforeInset: number,
  opening: boolean,
): void {
  if (prefersReducedMotion() || typeof main.animate !== 'function') return;

  const afterInset = mainSidebarInset(main);
  const deltaX = beforeInset - afterInset;
  if (Math.abs(deltaX) > 0.5) {
    mainShiftAnimation = main.animate(
      [
        { transform: `translateX(${deltaX}px)` },
        { transform: 'translateX(0)' },
      ],
      {
        duration: SIDEBAR_SPATIAL_DURATION_MS,
        easing: SIDEBAR_SPATIAL_EASING,
      },
    );
  }

  if (!opening) return;
  const inner = sidebar.querySelector<HTMLElement>('.sidebar-inner');
  if (!inner || typeof inner.animate !== 'function') return;
  sidebarRevealAnimation = inner.animate(
    [
      { opacity: 0.82, transform: 'translateX(-4px)' },
      { opacity: 1, transform: 'translateX(0)' },
    ],
    {
      duration: SIDEBAR_SPATIAL_DURATION_MS,
      easing: SIDEBAR_SPATIAL_EASING,
    },
  );
}

export function hydrateRecentsFilterState(): void {
  if (useSidebarStore.getState().recentsFilterLoaded) return;
  setSidebarRecentsFilter(storedRecentsFilter());
}

export function getRecentsFilter(): string | null {
  hydrateRecentsFilterState();
  return useSidebarStore.getState().recentsFilter;
}

export function setRecentsFilter(value: string | null): void {
  const filter = value || null;
  try {
    if (filter) localStorage.setItem(RECENTS_FILTER_KEY, filter);
    else localStorage.removeItem(RECENTS_FILTER_KEY);
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: sidebar/sidebar.service.ts:99', 'expected');
    /* storage is optional in private and embedded contexts */
  }
  setSidebarRecentsFilter(filter);
  renderRecents();
}

export function clearRecentsFilter(): void {
  setRecentsFilter(null);
}

export function onRecentsFilterChipClick(value: string): void {
  const current = getRecentsFilter();
  setRecentsFilter(value === 'all' || current === value ? null : value);
}

export function refreshRecentsFilterChipData(): void {
  bumpRecentsVersion();
}

/**
 * Project the sidebar's open state onto the DOM.
 *
 * The zustand store is the single source of truth (S1 in
 * docs/plans/2026-11-04-sidebar-ui-consistency.md): every runtime mutator
 * dispatches here, and the `collapsed` class plus the `socrates-sb`
 * preference are written back from this one place. Boot hydration, viewport
 * transitions and sign-out reset use this directly; toggleSidebar() adds the
 * desktop FLIP on top. The mobile backdrop stays with the callers — each has
 * its own nuance about when the overlay may appear.
 */
export function projectSidebarOpen(open: boolean, opts: { persist?: boolean } = {}): void {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('collapsed', !open);
  setSidebarOpen(open);
  if (opts.persist) {
    try { localStorage.setItem('socrates-sb', open ? '1' : '0'); } catch (error) {
      reportEmptyCatch(error, 'empty catch: sidebar/sidebar.service.ts:projectSidebarOpen', 'expected');
      /* storage is optional */
    }
  }
}

export function toggleSidebar(): void {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const desktop = window.innerWidth >= DESKTOP_VIEWPORT_MIN_PX;
  const main = desktop ? document.querySelector<HTMLElement>('#appShell .main') : null;

  /* Read the visible position BEFORE cancelling. On a rapid reversal the
     committed inset already points at the previous destination, while the
     compositor is still in flight. Carry its current offset into the next
     FLIP so the content never snaps to that unfinished destination. */
  const visibleOffset = visibleMainOffset(main);
  const beforeInset = main ? mainSidebarInset(main) + visibleOffset : 0;
  cancelDesktopSidebarMotion();

  /* The store decides; class, backdrop and the persisted preference follow. */
  const open = !useSidebarStore.getState().isOpen;
  projectSidebarOpen(open, { persist: true });
  const backdrop = document.getElementById('sidebarBackdrop');
  if (isMobileViewport() && open) backdrop?.classList.add('show');
  else backdrop?.classList.remove('show');

  if (desktop && main) {
    animateDesktopSidebarMotion(sidebar, main, beforeInset, open);
  }
}

/**
 * Phone-only dismiss. The drawer overlays the conversation, so any action
 * that changes the main surface (opening a session, starting a new one) has
 * to reveal that surface. Desktop keeps its persistent rail, and the
 * long-press context menu is a drawer-internal interaction, so both are left
 * alone. Returns whether the drawer was actually open.
 */
export function closeSidebarOnMobile(): boolean {
  if (window.innerWidth >= DESKTOP_VIEWPORT_MIN_PX) return false;
  if (!useSidebarStore.getState().isOpen) return false;
  toggleSidebar();
  return true;
}
