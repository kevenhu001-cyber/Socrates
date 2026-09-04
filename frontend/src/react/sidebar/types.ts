/**
 * Shared contracts for the sidebar React migration boundary.
 *
 * The legacy state lives in `window.stateStore.read("activeProjectFilter")`
 * (read via `getRecentsFilter()`) and in the `.active` class on
 * `.sidebar-nav-btn[data-nav]` (managed by `setActiveNav()`). Both are
 * mirrored here as typed snapshots over dedicated bridges.
 */

export type SidebarNavKey =
  | 'library'
  | 'projects'
  | 'scheduled'
  | 'plugins'
  | 'exam'
  | 'admin'
  | 'more'
  | null;

export interface SidebarNavSnapshot {
  activeNav: SidebarNavKey;
  revision: number;
}

export interface SidebarNavBridge {
  getSnapshot: () => SidebarNavSnapshot;
  publish: (snapshot: Omit<SidebarNavSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

export interface RecentsFilterSnapshot {
  filter: string | null;
  revision: number;
}

export interface RecentsFilterBridge {
  getSnapshot: () => RecentsFilterSnapshot;
  publish: (snapshot: Omit<RecentsFilterSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesSidebarNavBridge?: SidebarNavBridge;
    __socratesRecentsFilterBridge?: RecentsFilterBridge;
  }
}