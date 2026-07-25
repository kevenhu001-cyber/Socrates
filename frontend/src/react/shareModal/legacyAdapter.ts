import { useSyncExternalStore } from 'react';

import {
  getShareSnapshot,
  subscribeToShare,
} from './shareModalStore';
import type { ShareSnapshot, ShareVisibility } from './types';
import { getLegacyActions } from '../legacy/gateway';

declare global {
  interface Window {
    selectShareVis?: (vis: string) => void;
    createShareLink?: () => void;
    copyShareLink?: () => void;
    revokeShareLink?: () => void;
    closeShareModal?: () => void;
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
  const s = getLegacyActions().share;
  return {
    selectVis: (vis: ShareVisibility) => s.selectShareVis(vis),
    createLink: () => s.createShareLink(),
    copyLink: () => s.copyShareLink(),
    revokeLink: () => s.revokeShareLink(),
    close: () => s.closeShareModal(),
  };
}
