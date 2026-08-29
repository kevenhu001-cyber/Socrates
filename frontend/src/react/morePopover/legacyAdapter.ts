import { useSyncExternalStore } from 'react';

import {
  getMorePopoverSnapshot,
  subscribeToMorePopover,
} from './morePopoverStore';
import type { MorePopoverAction, MorePopoverSnapshot } from './types';
import { getLegacyActions } from '../legacy/gateway';

declare global {
  interface Window {
    closeMorePopover?: () => void;
    openPromptTemplatesModal?: () => void;
    openSettings?: () => void;
    toggleDisplayPrefs?: () => void;
    openCheatsheet?: () => void;
    signOut?: () => void;
  }
}

function dispatchAction(action: MorePopoverAction): void {
  const nav = getLegacyActions().navigation;
  nav.closeMorePopover();

  switch (action) {
    /* The desktop shell trims the sidebar nav to the five primary
       destinations, so Plugins and Exam route through here — without them the
       two panels had no entry point at all above 768px. */
    case 'plugins':
      nav.openNav('plugins');
      return;
    case 'exam':
      nav.openNav('exam');
      return;
    case 'skills':
      nav.openPromptTemplatesModal();
      return;
    case 'settings':
      nav.openSettings();
      return;
    case 'display':
      nav.toggleDisplayPrefs();
      return;
    case 'shortcuts':
      nav.openCheatsheet();
      return;
    case 'signout':
      nav.signOut();
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
