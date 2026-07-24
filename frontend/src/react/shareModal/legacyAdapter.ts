import { useSyncExternalStore } from 'react';

import {
  getShareSnapshot,
  subscribeToShare,
} from './shareModalStore';
import type { ShareSnapshot, ShareVisibility } from './types';

declare global {
  interface Window {
    selectShareVis?: (vis: string) => void;
    createShareLink?: () => void;
    copyShareLink?: () => void;
    revokeShareLink?: () => void;
    closeShareModal?: () => void;
    t?: (key: string) => string;
  }
}

export function useShareSnapshot(): ShareSnapshot {
  return useSyncExternalStore(
    subscribeToShare,
    getShareSnapshot,
    getShareSnapshot,
  );
}

export function useIsShareOpen(): boolean {
  return useSyncExternalStore(
    subscribeToShare,
    () => getShareSnapshot().isOpen,
    () => false,
  );
}

export function useShareDispatch(): {
  selectVis: (vis: ShareVisibility) => void;
  createLink: () => void;
  copyLink: () => void;
  revokeLink: () => void;
  close: () => void;
} {
  return {
    selectVis: (vis: ShareVisibility) => {
      if (typeof window.selectShareVis === 'function') window.selectShareVis(vis);
    },
    createLink: () => {
      if (typeof window.createShareLink === 'function') window.createShareLink();
    },
    copyLink: () => {
      if (typeof window.copyShareLink === 'function') window.copyShareLink();
    },
    revokeLink: () => {
      if (typeof window.revokeShareLink === 'function') window.revokeShareLink();
    },
    close: () => {
      if (typeof window.closeShareModal === 'function') window.closeShareModal();
    },
  };
}
