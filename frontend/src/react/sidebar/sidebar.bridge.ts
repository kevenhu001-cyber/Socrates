/**
 * Sidebar bridges — M2 single-bridge migration.
 *
 * The sidebar module historically packed two bridges in one file:
 * `__socratesSidebarNavBridge` (which nav button is `.active`) and
 * `__socratesRecentsFilterBridge` (the recents chip filter). Both are
 * factory-backed immutable bridges here, with the same legacy `publish`
 * alias and the same React hooks.
 *
 * M2 conventions
 *  - `getSnapshot` / `subscribe` / `dispatch` come from the factory.
 *  - `publish` is a thin alias for legacy callers.
 *  - React subscribers use `useBridge(bridge)` directly.
 *  - The seed helper reads legacy state on bootstrap so the first React
 *    render doesn't show a flash of "no nav selected".
 */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import { getLegacyActions } from '../legacy/gateway';
import type {
  RecentsFilterBridge,
  RecentsFilterSnapshot,
  SidebarNavBridge,
  SidebarNavKey,
  SidebarNavSnapshot,
} from './types';

declare global {
  interface Window {
    __socratesSidebarNavBridge?: SidebarNavBridge;
    __socratesRecentsFilterBridge?: RecentsFilterBridge;
  }
}

// ── nav bridge ──────────────────────────────────────────────────────────

const navBridge = createImmutableBridge<SidebarNavSnapshot, Omit<SidebarNavSnapshot, 'revision'>>({
  initial: { activeNav: null, revision: 0 },
  reducer: (state, action) => ({ ...action, revision: state.revision + 1 }),
});

const navWindowBridge: SidebarNavBridge = Object.assign(navBridge, {
  publish: navBridge.dispatch,
}) as SidebarNavBridge;

export function installSidebarNavBridge(): SidebarNavBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesSidebarNavBridge) {
      window.__socratesSidebarNavBridge = navWindowBridge;
    }
    return window.__socratesSidebarNavBridge;
  }
  return navWindowBridge;
}

export function getSidebarNavSnapshot(): SidebarNavSnapshot {
  return installSidebarNavBridge().getSnapshot();
}

export function subscribeToSidebarNav(listener: () => void): () => void {
  return installSidebarNavBridge().subscribe(listener);
}

export function publishSidebarNav(activeNav: SidebarNavKey): void {
  navBridge.dispatch({ activeNav });
}

export function useSidebarNavSnapshot(): SidebarNavSnapshot {
  return useBridge(navBridge);
}

export function useActiveNav(): SidebarNavKey {
  return useBridge(navBridge).activeNav;
}

// ── recents filter bridge ───────────────────────────────────────────────

const filterBridge = createImmutableBridge<RecentsFilterSnapshot, Omit<RecentsFilterSnapshot, 'revision'>>({
  initial: { filter: null, revision: 0 },
  reducer: (state, action) => ({ ...action, revision: state.revision + 1 }),
});

const filterWindowBridge: RecentsFilterBridge = Object.assign(filterBridge, {
  publish: filterBridge.dispatch,
}) as RecentsFilterBridge;

export function installRecentsFilterBridge(): RecentsFilterBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesRecentsFilterBridge) {
      window.__socratesRecentsFilterBridge = filterWindowBridge;
    }
    return window.__socratesRecentsFilterBridge;
  }
  return filterWindowBridge;
}

export function getRecentsFilterSnapshot(): RecentsFilterSnapshot {
  return installRecentsFilterBridge().getSnapshot();
}

export function subscribeToRecentsFilter(listener: () => void): () => void {
  return installRecentsFilterBridge().subscribe(listener);
}

export function publishRecentsFilter(filter: string | null): void {
  filterBridge.dispatch({ filter });
}

export function useRecentsFilterSnapshot(): RecentsFilterSnapshot {
  return useBridge(filterBridge);
}

export function useRecentsFilter(): string | null {
  return useBridge(filterBridge).filter;
}

// ── commands (legacy gateway dispatch) ──────────────────────────────────

export function useSidebarNavCommands(): { open: (key: string) => void } {
  return {
    open: (key: string) => {
      getLegacyActions().navigation.openNav(key);
    },
  };
}

export function useRecentsFilterCommands(): {
  pick: (value: string | null) => void;
} {
  return {
    pick: (value: string | null) => {
      if (value === null || value === 'all') {
        getLegacyActions().sessions.onRecentsFilterChipClick('all');
      } else {
        getLegacyActions().sessions.onRecentsFilterChipClick(value);
      }
    },
  };
}

// ── bootstrap helper ────────────────────────────────────────────────────

/* Hydrate both bridges and seed them with the persisted/current state
   so the first React render doesn't show a flash of "no nav selected"
   or "no filter". Idempotent — safe to call on every React bootstrap. */
export function seedSidebarBridgesFromLegacy(): void {
  installSidebarNavBridge();
  installRecentsFilterBridge();

  // Seed the filter from localStorage (the legacy single source of truth).
  try {
    const current = getLegacyActions().sessions.getRecentsFilter?.() ?? null;
    publishRecentsFilter(current ?? null);
  } catch (_) { /* localStorage may be unavailable */ }

  // Seed the active nav from the current DOM state — `?route=/library`
  // navigations call openNav() before React mounts, so the .active class
  // is already on the right button.
  publishSidebarNav(readActiveNavFromDom());
}

function readActiveNavFromDom(): SidebarNavKey {
  const active = document.querySelector('.sidebar-nav-btn.active');
  if (!active) return null;
  const key = active.getAttribute('data-nav');
  return (key as SidebarNavKey) ?? null;
}
