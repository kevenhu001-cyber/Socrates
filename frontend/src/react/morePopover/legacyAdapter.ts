import { useSyncExternalStore } from 'react';

import {
  getMorePopoverSnapshot,
  subscribeToMorePopover,
} from './morePopoverStore';
import type { MorePopoverAction, MorePopoverSnapshot } from './types';

declare global {
  interface Window {
    closeMorePopover?: () => void;
    openPromptTemplatesModal?: () => void;
    openSettings?: () => void;
    toggleDisplayPrefs?: () => void;
    openCheatsheet?: () => void;
    signOut?: () => void;
    t?: (key: string) => string;
  }
}

function dispatchAction(action: MorePopoverAction): void {
  if (typeof window.closeMorePopover === 'function') window.closeMorePopover();

  switch (action) {
    case 'skills':
      if (typeof window.openPromptTemplatesModal === 'function') window.openPromptTemplatesModal();
      return;
    case 'settings':
      if (typeof window.openSettings === 'function') window.openSettings();
      return;
    case 'display':
      if (typeof window.toggleDisplayPrefs === 'function') window.toggleDisplayPrefs();
      return;
    case 'shortcuts':
      if (typeof window.openCheatsheet === 'function') window.openCheatsheet();
      return;
    case 'signout':
      if (typeof window.signOut === 'function') window.signOut();
      return;
  }
}

export function useMorePopoverSnapshot(): MorePopoverSnapshot {
  return useSyncExternalStore(
    subscribeToMorePopover,
    getMorePopoverSnapshot,
    getMorePopoverSnapshot,
  );
}

export function useIsMorePopoverOpen(): boolean {
  return useSyncExternalStore(
    subscribeToMorePopover,
    () => getMorePopoverSnapshot().isOpen,
    () => false,
  );
}

export function useMorePopoverDispatch(): {
  pick: (action: MorePopoverAction) => void;
} {
  return {
    pick: (action: MorePopoverAction) => {
      dispatchAction(action);
    },
  };
}
