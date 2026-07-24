import { useSyncExternalStore } from 'react';

import {
  getSidebarChromeSnapshot,
  subscribeToSidebarChrome,
} from './sidebarChromeStore';
import type { SidebarChromeSnapshot, UserInfo } from './types';

export function useSidebarChromeSnapshot(): SidebarChromeSnapshot {
  return useSyncExternalStore(
    subscribeToSidebarChrome,
    getSidebarChromeSnapshot,
    getSidebarChromeSnapshot,
  );
}

export function useUserInfo(): UserInfo {
  return useSyncExternalStore(
    subscribeToSidebarChrome,
    () => getSidebarChromeSnapshot().user,
    () => getSidebarChromeSnapshot().user,
  );
}
