import { useCallback } from 'react';
import { useSyncExternalStore } from 'react';

import {
  getRecentsFilterSnapshot,
  getSidebarNavSnapshot,
  installRecentsFilterBridge,
  installSidebarNavBridge,
  publishRecentsFilter,
  publishSidebarNav,
  subscribeToRecentsFilter,
  subscribeToSidebarNav,
} from './sidebarRuntimeStore';
import type {
  RecentsFilterSnapshot,
  SidebarNavKey,
  SidebarNavSnapshot,
} from './types';

declare global {
  interface Window {
    openNav?: (key: string) => void;
    onRecentsFilterChipClick?: (value: string) => void;
    getRecentsFilter?: () => string | null;
  }
}

/* Hydrate both bridges and seed them with the persisted/current state
   so the first React render doesn't show a flash of "no nav selected"
   or "no filter". Idempotent — safe to call on every React bootstrap. */
export function seedSidebarBridgesFromLegacy(): void {
  installSidebarNavBridge();
  installRecentsFilterBridge();

  // Seed the filter from localStorage (the legacy single source of truth).
  try {
    const current = typeof window.getRecentsFilter === 'function'
      ? window.getRecentsFilter()
      : null;
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

export function useSidebarNavCommands(): {
  open: (key: string) => void;
} {
  return {
    open: useCallback((key: string) => {
      if (typeof window.openNav === 'function') window.openNav(key);
    }, []),
  };
}

export function useRecentsFilterCommands(): {
  pick: (value: string | null) => void;
} {
  return useCallback(() => {
    const pick = (value: string | null) => {
      if (value === null || value === 'all') {
        if (typeof window.onRecentsFilterChipClick === 'function') window.onRecentsFilterChipClick('all');
      } else if (typeof window.onRecentsFilterChipClick === 'function') {
        window.onRecentsFilterChipClick(value);
      }
    };
    return { pick };
  }, [])();
}

export function useSidebarNavSnapshot(): SidebarNavSnapshot {
  return useSyncExternalStore(subscribeToSidebarNav, getSidebarNavSnapshot, getSidebarNavSnapshot);
}

export function useActiveNav(): SidebarNavKey {
  return useSyncExternalStore(
    subscribeToSidebarNav,
    () => getSidebarNavSnapshot().activeNav,
    () => null,
  );
}

export function useRecentsFilterSnapshot(): RecentsFilterSnapshot {
  return useSyncExternalStore(subscribeToRecentsFilter, getRecentsFilterSnapshot, getRecentsFilterSnapshot);
}

export function useRecentsFilter(): string | null {
  return useSyncExternalStore(
    subscribeToRecentsFilter,
    () => getRecentsFilterSnapshot().filter,
    () => null,
  );
}