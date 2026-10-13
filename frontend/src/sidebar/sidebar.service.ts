import { bumpRecentsVersion, setSidebarRecentsFilter, useSidebarStore } from './sidebar.store';

const RECENTS_FILTER_KEY = 'socrates-recents-filter';
const DESKTOP_SIDEBAR_BREAKPOINT = 769;
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

/**
 * Desktop open/close uses a FLIP-style compositor transition.
 *
 * CSS commits the target sidebar width and main padding immediately; animating
 * either property would relayout the transcript, composer and top bar on every
 * frame. We instead measure the main surface before/after the class flip and
 * visually carry it from the old x-position to the new one with transform.
 * The sidebar itself is already on the page colour, so only the newly revealed
 * content needs a tiny fade/translate on open.
 */
function animateDesktopSidebarMotion(
  sidebar: HTMLElement,
  main: HTMLElement,
  beforeMainLeft: number,
  opening: boolean,
): void {
  if (prefersReducedMotion() || typeof main.animate !== 'function') return;

  const afterMainLeft = main.getBoundingClientRect().left;
  const deltaX = beforeMainLeft - afterMainLeft;
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
  } catch { /* storage is optional in private and embedded contexts */ }
  setSidebarRecentsFilter(filter);
  const legacyWindow = window as Window & { renderRecents?: () => void };
  legacyWindow.renderRecents?.();
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

export function toggleSidebar(): void {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const backdrop = document.getElementById('sidebarBackdrop');
  const desktop = window.innerWidth >= DESKTOP_SIDEBAR_BREAKPOINT;
  const main = desktop ? document.querySelector<HTMLElement>('#appShell .main') : null;

  /* A rapid second toggle should start from the committed layout state, not
     from the transform of the animation that is still in flight. */
  cancelDesktopSidebarMotion();
  const beforeMainLeft = main ? main.getBoundingClientRect().left : 0;

  const wasCollapsed = sidebar.classList.contains('collapsed');
  if (wasCollapsed) {
    sidebar.classList.remove('collapsed');
    if (backdrop && window.innerWidth < 768) backdrop.classList.add('show');
  } else {
    sidebar.classList.add('collapsed');
    backdrop?.classList.remove('show');
  }
  const open = !sidebar.classList.contains('collapsed');

  if (desktop && main) {
    animateDesktopSidebarMotion(sidebar, main, beforeMainLeft, open);
  }

  const legacyWindow = window as Window & { sidebarOpen?: boolean; syncSidebarBtns?: () => void };
  legacyWindow.sidebarOpen = open;
  legacyWindow.syncSidebarBtns?.();
  try { localStorage.setItem('socrates-sb', open ? '1' : '0'); } catch { /* storage is optional */ }
}
