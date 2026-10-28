import { pushHomeRoute, pushWorkspaceRoute, workspaceForPath } from '../app/router.js';
import { activateMainView, getVisibleCoreView } from '../ui/mainViewController.js';
import { getActiveDestination, setActiveDestination } from './navigation.store.ts';
import { DESTINATIONS, isPageDestination } from './navigation.destinations';
import { toggleSidebar } from './sidebar.service';
import type { SidebarNavKey } from '../react/sidebar/types';

type NavigationDestination = Exclude<SidebarNavKey, null>;
type NavigationTarget = NavigationDestination | 'skills';
type DestinationOpener = () => void;
type NavigationAdapters = Partial<Record<NavigationTarget, DestinationOpener>> & {
  closePanels?: () => void;
};

let adapters: NavigationAdapters = {};
let routeListenersInstalled = false;
let homeReturnView = 'topicSetup';

function closeMobileSidebarAfterNavigation(destination: NavigationTarget): void {
  if (destination === 'more' || window.innerWidth >= 768) return;
  const sidebar = document.getElementById('sidebar');
  if (sidebar && !sidebar.classList.contains('collapsed')) toggleSidebar();
}

export function registerNavigationAdapters(next: NavigationAdapters): void {
  adapters = next;
}

export function setActiveNav(destination: SidebarNavKey): void {
  setActiveDestination(destination);
}

export function openNav(name: string, options?: { fromRoute?: boolean }): void {
  if (!isPageDestination(name) && name !== 'more' && name !== 'skills') return;
  const destination = name as NavigationTarget;
  const fromRoute = options?.fromRoute === true;

  if (isPageDestination(destination)) {
    const coreView = getVisibleCoreView(document);
    if (!document.getElementById(coreView)?.classList.contains('hidden')) homeReturnView = coreView;
    if (!fromRoute) pushWorkspaceRoute(destination);
    setActiveNav(destination);
    activateMainView(DESTINATIONS[destination].host, document);
  }
  if (destination !== 'more') adapters.closePanels?.();
  adapters[destination]?.();

  // Workspace destinations take over the main pane on phones, so dismiss
  // the drawer after navigation. More remains an in-drawer interaction.
  closeMobileSidebarAfterNavigation(destination);
}

export function exitPluginsView(): void {
  activateMainView(homeReturnView, document);
  pushHomeRoute();
  setActiveNav(null);
}

export function syncWorkspaceRoute(): void {
  const destination = workspaceForPath(location.pathname);
  if (destination) {
    openNav(destination, { fromRoute: true });
  } else if (location.pathname === '/' && getActiveDestination() !== null) {
    // A history transition home restores the existing session; it must not
    // start a new chat or erase drafts. Query-based session loading stays
    // with the session owner.
    activateMainView(homeReturnView, document);
    setActiveNav(null);
  }
}

export function installNavigationRouteListeners(): void {
  if (routeListenersInstalled) return;
  routeListenersInstalled = true;
  window.addEventListener('popstate', syncWorkspaceRoute);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncWorkspaceRoute, { once: true });
  } else {
    setTimeout(syncWorkspaceRoute, 0);
  }
}
