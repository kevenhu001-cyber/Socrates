import type {
  RecentsFilterBridge,
  RecentsFilterSnapshot,
  SidebarNavBridge,
  SidebarNavKey,
  SidebarNavSnapshot,
} from './types';

type Listener = () => void;

// --- nav store ----------------------------------------------------------

const INITIAL_NAV: SidebarNavSnapshot = Object.freeze({
  activeNav: null,
  revision: 0,
});

let navSnapshot: SidebarNavSnapshot = INITIAL_NAV;
const navListeners = new Set<Listener>();

function commitNav(next: Omit<SidebarNavSnapshot, 'revision'>): void {
  navSnapshot = Object.freeze({
    ...next,
    revision: navSnapshot.revision + 1,
  });
  navListeners.forEach((listener) => listener());
}

export function installSidebarNavBridge(): SidebarNavBridge {
  const existing = window.__socratesSidebarNavBridge;
  if (existing) return existing;
  const bridge: SidebarNavBridge = {
    getSnapshot: () => navSnapshot,
    publish: commitNav,
    subscribe: (listener) => {
      navListeners.add(listener);
      return () => navListeners.delete(listener);
    },
  };
  window.__socratesSidebarNavBridge = bridge;
  return bridge;
}

export function getSidebarNavSnapshot(): SidebarNavSnapshot {
  return installSidebarNavBridge().getSnapshot();
}

export function subscribeToSidebarNav(listener: Listener): () => void {
  return installSidebarNavBridge().subscribe(listener);
}

export function publishSidebarNav(activeNav: SidebarNavKey): void {
  commitNav({ activeNav });
}

// --- filter store -------------------------------------------------------

const INITIAL_FILTER: RecentsFilterSnapshot = Object.freeze({
  filter: null,
  revision: 0,
});

let filterSnapshot: RecentsFilterSnapshot = INITIAL_FILTER;
const filterListeners = new Set<Listener>();

function commitFilter(next: Omit<RecentsFilterSnapshot, 'revision'>): void {
  filterSnapshot = Object.freeze({
    ...next,
    revision: filterSnapshot.revision + 1,
  });
  filterListeners.forEach((listener) => listener());
}

export function installRecentsFilterBridge(): RecentsFilterBridge {
  const existing = window.__socratesRecentsFilterBridge;
  if (existing) return existing;
  const bridge: RecentsFilterBridge = {
    getSnapshot: () => filterSnapshot,
    publish: commitFilter,
    subscribe: (listener) => {
      filterListeners.add(listener);
      return () => filterListeners.delete(listener);
    },
  };
  window.__socratesRecentsFilterBridge = bridge;
  return bridge;
}

export function getRecentsFilterSnapshot(): RecentsFilterSnapshot {
  return installRecentsFilterBridge().getSnapshot();
}

export function subscribeToRecentsFilter(listener: Listener): () => void {
  return installRecentsFilterBridge().subscribe(listener);
}

export function publishRecentsFilter(filter: string | null): void {
  commitFilter({ filter });
}