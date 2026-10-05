import { bumpRecentsVersion, setSidebarRecentsFilter, useSidebarStore } from './sidebar.store';

const RECENTS_FILTER_KEY = 'socrates-recents-filter';

function storedRecentsFilter(): string | null {
  try { return localStorage.getItem(RECENTS_FILTER_KEY) || null; } catch { return null; }
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
  const wasCollapsed = sidebar.classList.contains('collapsed');
  if (wasCollapsed) {
    sidebar.classList.remove('collapsed');
    if (backdrop && window.innerWidth < 768) backdrop.classList.add('show');
  } else {
    sidebar.classList.add('collapsed');
    backdrop?.classList.remove('show');
  }
  const open = !sidebar.classList.contains('collapsed');
  const legacyWindow = window as Window & { sidebarOpen?: boolean; syncSidebarBtns?: () => void };
  legacyWindow.sidebarOpen = open;
  legacyWindow.syncSidebarBtns?.();
  try { localStorage.setItem('socrates-sb', open ? '1' : '0'); } catch { /* storage is optional */ }
}
