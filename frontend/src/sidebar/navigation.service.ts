import { pushHomeRoute, pushWorkspaceRoute, workspaceForPath } from '../app/router.js';
import { activateMainView, getVisibleCoreView } from '../ui/mainViewController.js';
import { setActiveDestination } from './navigation.store';
import type { SidebarNavKey } from '../react/sidebar/types';

type NavigationDestination = Exclude<SidebarNavKey, null>;
type NavigationTarget = NavigationDestination | 'skills';
type DestinationOpener = () => void;
type NavigationAdapters = Partial<Record<NavigationTarget, DestinationOpener>> & {
  closePanels?: () => void;
};

const NAVIGATION_DESTINATIONS: ReadonlySet<string> = new Set([
  'library', 'projects', 'scheduled', 'plugins', 'images', 'assistants',
  'sites', 'exam', 'admin', 'more', 'skills',
]);

let adapters: NavigationAdapters = {};
let routeListenersInstalled = false;
let pluginsReturnView = 'topicSetup';

export function registerNavigationAdapters(next: NavigationAdapters): void {
  adapters = next;
}

export function setActiveNav(destination: SidebarNavKey): void {
  setActiveDestination(destination);
}

export function openNav(name: string, options?: { fromRoute?: boolean }): void {
  if (!NAVIGATION_DESTINATIONS.has(name)) return;
  const destination = name as NavigationTarget;
  const fromRoute = options?.fromRoute === true;

  if (destination !== 'more' && !fromRoute) pushWorkspaceRoute(destination);
  if (destination === 'plugins') pluginsReturnView = getVisibleCoreView(document);
  setActiveNav(destination === 'skills' ? null : destination);
  if (destination !== 'more') adapters.closePanels?.();
  adapters[destination]?.();

  // Workspace destinations take over the main pane on phones, so dismiss
  // the drawer after navigation. More remains an in-drawer interaction.
  if (destination !== 'more' && window.innerWidth < 768) {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar && !sidebar.classList.contains('collapsed')) {
      sidebar.classList.add('collapsed');
      backdrop?.classList.remove('show');
      const legacyWindow = window as Window & { sidebarOpen?: boolean; syncSidebarBtns?: () => void };
      legacyWindow.sidebarOpen = false;
      try { localStorage.setItem('socrates-sb', '0'); } catch { /* storage is optional */ }
      legacyWindow.syncSidebarBtns?.();
    }
  }
}

export function exitPluginsView(): void {
  activateMainView(pluginsReturnView || 'topicSetup', document);
  pushHomeRoute();
  pluginsReturnView = 'topicSetup';
  setActiveNav(null);
}

export function syncWorkspaceRoute(): void {
  const destination = workspaceForPath(location.pathname);
  if (destination) openNav(destination, { fromRoute: true });
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
