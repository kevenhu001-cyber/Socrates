/**
 * Sidebar chrome bridge — M2 single-bridge migration.
 *
 * Holds the user-info snapshot consumed by `SidebarHeader` and
 * `SidebarFooter`. Legacy `ui/profile.js` publishes via
 * `window.__socratesSidebarChromeBridge.publish(...)`; React components
 * read through `useBridge`.
 */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import type {
  SidebarChromeBridge,
  SidebarChromeSnapshot,
  UserInfo,
} from './types';

declare global {
  interface Window {
    __socratesSidebarChromeBridge?: SidebarChromeBridge;
  }
}

const GUEST_USER: UserInfo = Object.freeze({
  initials: '?',
  displayName: 'Guest',
  email: '',
  tier: 'diophantus',
  tierLabel: 'Free',
  isSignedIn: false,
});

type Action = Omit<SidebarChromeSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<SidebarChromeSnapshot, Action>({
  initial: { user: GUEST_USER, revision: 0 },
  reducer: (state, action) => ({ ...action, revision: state.revision + 1 }),
});

const bridge: SidebarChromeBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as SidebarChromeBridge;

export function installSidebarChromeBridge(): SidebarChromeBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesSidebarChromeBridge) {
      window.__socratesSidebarChromeBridge = bridge;
    }
    return window.__socratesSidebarChromeBridge;
  }
  return bridge;
}

export function getSidebarChromeSnapshot(): SidebarChromeSnapshot {
  return installSidebarChromeBridge().getSnapshot();
}

export function subscribeToSidebarChrome(listener: () => void): () => void {
  return installSidebarChromeBridge().subscribe(listener);
}

export function useSidebarChromeSnapshot(): SidebarChromeSnapshot {
  return useBridge(factoryBridge);
}

export function useUserInfo(): UserInfo {
  return useBridge(factoryBridge).user;
}
